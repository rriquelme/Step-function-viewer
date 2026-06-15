// Variable data-flow analysis: which states create variables (Assign) and which
// states reference them (JSONata expressions). Produces both a per-variable
// index (for cross-state highlighting) and a per-state summary (for the
// click-a-state menu). This is the core of the extension's differentiator.
import type { Graph } from '../asl/graph';
import { extractVariableReferences } from '../asl/jsonata';
import { resolveByPath } from '../asl/resolve';
import type { CatchRule, State, StateMachine } from '../asl/types';

export interface VariableUsage {
  /** Scope-qualified state id. */
  nodeId: string;
  /** State name as written. */
  stateName: string;
  /** Top-level state field where the usage occurs (e.g. "Assign", "Arguments"). */
  field: string;
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

export function analyzeVariables(
  machine: StateMachine | undefined,
  graph: Graph,
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

    for (const name of definitionsOf(state)) {
      created.add(name);
      ensure(name).definitions.push({ nodeId: node.id, stateName: node.name, field: 'Assign' });
    }

    for (const { name, field } of referencesOf(state)) {
      used.add(name);
      ensure(name).references.push({ nodeId: node.id, stateName: node.name, field });
    }

    perState[node.id] = { created: [...created].sort(), used: [...used].sort() };
  }

  const variables = [...index.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { variables, perState };
}

/** Variable names created by a state's Assign block(s), including Catch rules. */
function definitionsOf(state: State): string[] {
  const names = new Set<string>();
  if (state.Assign && typeof state.Assign === 'object') {
    for (const key of Object.keys(state.Assign)) {
      names.add(key);
    }
  }
  const withCatch = state as { Catch?: CatchRule[] };
  for (const rule of withCatch.Catch ?? []) {
    if (rule.Assign && typeof rule.Assign === 'object') {
      for (const key of Object.keys(rule.Assign)) {
        names.add(key);
      }
    }
  }
  return [...names];
}

/** Variable references within a state's own fields (not nested sub-machines). */
function referencesOf(state: State): { name: string; field: string }[] {
  const out: { name: string; field: string }[] = [];
  for (const [field, value] of Object.entries(state)) {
    if (STRUCTURAL_KEYS.has(field)) {
      continue;
    }
    walkValue(value, field, out);
  }
  return out;
}

function walkValue(value: unknown, field: string, out: { name: string; field: string }[]): void {
  if (typeof value === 'string') {
    for (const name of extractVariableReferences(value)) {
      out.push({ name, field });
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      walkValue(item, field, out);
    }
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) {
      walkValue(v, field, out);
    }
  }
}
