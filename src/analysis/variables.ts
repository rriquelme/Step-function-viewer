// Variable data-flow analysis: which states create variables (Assign) and which
// states reference them (JSONata expressions). Produces both a per-variable
// index (for cross-state highlighting) and a per-state summary (for the
// click-a-state menu). This is the core of the extension's differentiator.
import type { Graph } from '../asl/graph';
import { extractVariableReferences } from '../asl/jsonata';
import { type SourceRange, rangeForPath } from '../asl/parser';
import { resolveByPath } from '../asl/resolve';
import type { CatchRule, State, StateMachine } from '../asl/types';
import type { Node } from 'jsonc-parser';

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
  tree?: Node,
): VariableAnalysis {
  const index = new Map<string, VariableInfo>();
  const perState: Record<string, StateVariableSummary> = {};

  const ensure = (name: string): VariableInfo => {
    let info = index.get(name);
    if (!info) {
      info = { name, definitions: [], references: [] };
      index.set(name, info);
    }
    return info;
  };

  for (const node of graph.nodes) {
    const state = resolveByPath(machine, node.jsonPath) as State | undefined;
    if (!state) {
      continue;
    }

    const created = new Set<string>();
    const used = new Set<string>();

    for (const { name, path } of definitionsOf(state)) {
      created.add(name);
      ensure(name).definitions.push({
        nodeId: node.id,
        stateName: node.name,
        field: 'Assign',
        range: rangeForPath(tree, [...node.jsonPath, ...path]),
      });
    }

    for (const { name, field, path } of referencesOf(state)) {
      used.add(name);
      ensure(name).references.push({
        nodeId: node.id,
        stateName: node.name,
        field,
        range: rangeForPath(tree, [...node.jsonPath, ...path]),
      });
    }

    perState[node.id] = { created: [...created].sort(), used: [...used].sort() };
  }

  const variables = [...index.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { variables, perState };
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
