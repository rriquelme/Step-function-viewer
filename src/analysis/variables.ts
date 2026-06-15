// Variable data-flow analysis: which states create variables (Assign) and which
// states reference them (JSONata expressions). Produces both a per-variable
// index (for cross-state highlighting) and a per-state summary (for the
// click-a-state menu). This is the core of the extension's differentiator.
import type { Graph, GraphNode } from '../asl/graph';
import { extractVariableReferences, referencesMapItem } from '../asl/jsonata';
import type { RangeResolver, SourceRange } from '../asl/parser';
import { resolveByPath } from '../asl/resolve';
import type { CatchRule, State, StateMachine } from '../asl/types';

export interface VariableUsage {
  /** Scope-qualified state id. */
  nodeId: string;
  /** State name as written. */
  stateName: string;
  /** Top-level state field where the usage occurs (e.g. "Assign", "Arguments"). */
  field: string;
  /** Source range of the assigned/referencing expression, for jump-to-source. */
  range?: SourceRange;
}

export interface VariableInfo {
  name: string;
  definitions: VariableUsage[];
  references: VariableUsage[];
}

export interface StateVariableSummary {
  /** Variables this state creates via Assign (including Catch Assign). */
  created: string[];
  /** Variables this state references in its JSONata expressions. */
  used: string[];
}

export interface VariableAnalysis {
  /** All user variables, sorted by name. */
  variables: VariableInfo[];
  /** Per-state summary keyed by scope-qualified node id. */
  perState: Record<string, StateVariableSummary>;
}

/** State fields that hold nested sub-machines and must not be scanned here. */
const STRUCTURAL_KEYS = new Set(['Branches', 'ItemProcessor', 'Iterator', 'States']);

type RelPath = (string | number)[];

export function analyzeVariables(
  machine: StateMachine | undefined,
  graph: Graph,
  rangeAt: RangeResolver,
): VariableAnalysis {
  const index = new Map<string, VariableInfo>();
  const sets = new Map<string, { created: Set<string>; used: Set<string> }>();
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const mapItemReaders = new Map<string, GraphNode[]>();

  const ensure = (name: string): VariableInfo => {
    let info = index.get(name);
    if (!info) {
      info = { name, definitions: [], references: [] };
      index.set(name, info);
    }
    return info;
  };
  const setsFor = (id: string) => {
    let s = sets.get(id);
    if (!s) {
      s = { created: new Set(), used: new Set() };
      sets.set(id, s);
    }
    return s;
  };
  const mapItemVarName = (mapId: string) => `${nodeById.get(mapId)?.name ?? mapId}.item`;

  for (const node of graph.nodes) {
    const state = resolveByPath(machine, node.jsonPath) as State | undefined;
    if (!state) {
      continue;
    }

    const { created, used } = setsFor(node.id);

    for (const { name, path } of definitionsOf(state)) {
      created.add(name);
      ensure(name).definitions.push({
        nodeId: node.id,
        stateName: node.name,
        field: 'Assign',
        range: rangeAt([...node.jsonPath, ...path]),
      });
    }

    for (const { name, field, path } of referencesOf(state)) {
      used.add(name);
      ensure(name).references.push({
        nodeId: node.id,
        stateName: node.name,
        field,
        range: rangeAt([...node.jsonPath, ...path]),
      });
    }

    // The current Map iteration item (context), attributed to its enclosing Map.
    const mapId = enclosingMapId(node.id);
    if (mapId !== undefined && stateReferencesMapItem(state)) {
      used.add(mapItemVarName(mapId));
      (mapItemReaders.get(mapId) ?? mapItemReaders.set(mapId, []).get(mapId)!).push(node);
    }
  }

  // Synthesize one "<Map>.item" variable per Map whose items are read: the Map
  // "defines" the item (green), reader states "reference" it (blue).
  for (const [mapId, readers] of mapItemReaders) {
    const mapNode = nodeById.get(mapId);
    const name = mapItemVarName(mapId);
    const info = ensure(name);
    info.definitions.push({
      nodeId: mapId,
      stateName: mapNode?.name ?? mapId,
      field: 'Items',
      range: mapNode ? rangeAt([...mapNode.jsonPath, 'Items']) : undefined,
    });
    setsFor(mapId).created.add(name);
    for (const reader of readers) {
      info.references.push({ nodeId: reader.id, stateName: reader.name, field: 'Map.Item' });
    }
  }

  const perState: Record<string, StateVariableSummary> = {};
  for (const [id, { created, used }] of sets) {
    perState[id] = { created: [...created].sort(), used: [...used].sort() };
  }

  const variables = [...index.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { variables, perState };
}

/** The id of the nearest enclosing Map (the prefix before the last "/item/"). */
function enclosingMapId(nodeId: string): string | undefined {
  const idx = nodeId.lastIndexOf('/item/');
  return idx >= 0 ? nodeId.slice(0, idx) : undefined;
}

/** True when any of a state's own fields read the Map iteration item. */
function stateReferencesMapItem(state: State): boolean {
  let found = false;
  const walk = (value: unknown): void => {
    if (found) {
      return;
    }
    if (typeof value === 'string') {
      found = referencesMapItem(value);
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(walk);
    }
  };
  for (const [field, value] of Object.entries(state)) {
    if (!STRUCTURAL_KEYS.has(field)) {
      walk(value);
    }
  }
  return found;
}

/** Variable names created by a state's Assign block(s), with their relative path. */
function definitionsOf(state: State): { name: string; path: RelPath }[] {
  const out: { name: string; path: RelPath }[] = [];
  if (state.Assign && typeof state.Assign === 'object') {
    for (const key of Object.keys(state.Assign)) {
      out.push({ name: key, path: ['Assign', key] });
    }
  }
  const withCatch = state as { Catch?: CatchRule[] };
  (withCatch.Catch ?? []).forEach((rule, i) => {
    if (rule.Assign && typeof rule.Assign === 'object') {
      for (const key of Object.keys(rule.Assign)) {
        out.push({ name: key, path: ['Catch', i, 'Assign', key] });
      }
    }
  });
  return out;
}

/** Variable references within a state's own fields (not nested sub-machines). */
function referencesOf(state: State): { name: string; field: string; path: RelPath }[] {
  const out: { name: string; field: string; path: RelPath }[] = [];
  for (const [field, value] of Object.entries(state)) {
    if (STRUCTURAL_KEYS.has(field)) {
      continue;
    }
    walkValue(value, field, [field], out);
  }
  return out;
}

function walkValue(
  value: unknown,
  field: string,
  path: RelPath,
  out: { name: string; field: string; path: RelPath }[],
): void {
  if (typeof value === 'string') {
    for (const name of extractVariableReferences(value)) {
      out.push({ name, field, path });
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => walkValue(item, field, [...path, i], out));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      walkValue(v, field, [...path, k], out);
    }
  }
}
