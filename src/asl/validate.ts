// Structural validation of a state machine, producing diagnostics with source
// ranges so the editor can surface squiggles and a problems list.
import type { Graph } from './graph';
import type { RangeResolver, SourceRange } from './parser';
import { resolveByPath } from './resolve';
import type { State, StateMachine } from './types';

export type DiagnosticSeverity = 'error' | 'warning';

export interface Diagnostic {
  message: string;
  severity: DiagnosticSeverity;
  range?: SourceRange;
  /** Node id the diagnostic relates to, if any. */
  nodeId?: string;
}

/** State types that terminate a branch without Next/End. */
const TERMINAL_TYPES = new Set(['Succeed', 'Fail']);
/** State types whose flow is defined by Choices/Default rather than Next/End. */
const CHOICE_TYPES = new Set(['Choice']);

export function validateStateMachine(
  machine: StateMachine | undefined,
  graph: Graph,
  rangeAt: RangeResolver,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!machine) {
    diagnostics.push({ message: 'Document is not a valid JSON state machine.', severity: 'error' });
    return diagnostics;
  }

  if (!machine.StartAt) {
    diagnostics.push({ message: 'State machine is missing "StartAt".', severity: 'error' });
  } else if (!machine.States?.[machine.StartAt]) {
    diagnostics.push({
      message: `"StartAt" points to unknown state "${machine.StartAt}".`,
      severity: 'error',
      range: rangeAt(['StartAt']),
    });
  }

  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  // Dangling transitions: an edge whose target does not exist.
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.to)) {
      const fromNode = byId.get(edge.from);
      diagnostics.push({
        message: `Transition from "${fromNode?.name ?? edge.from}" targets unknown state "${displayName(edge.to)}".`,
        severity: 'error',
        range: fromNode?.range,
        nodeId: edge.from,
      });
    }
  }

  // States that need an exit but declare neither Next nor End.
  for (const node of graph.nodes) {
    if (TERMINAL_TYPES.has(node.type) || CHOICE_TYPES.has(node.type) || node.container) {
      continue;
    }
    const state = resolveByPath(machine, node.jsonPath) as State | undefined;
    if (state && !('Next' in state && state.Next) && !state.End) {
      diagnostics.push({
        message: `State "${node.name}" has neither "Next" nor "End": true.`,
        severity: 'warning',
        range: node.range,
        nodeId: node.id,
      });
    }
  }

  // Unreachable states (BFS from StartAt across all edges, including containers).
  const reachable = computeReachable(graph);
  for (const node of graph.nodes) {
    if (!reachable.has(node.id)) {
      diagnostics.push({
        message: `State "${node.name}" is unreachable.`,
        severity: 'warning',
        range: node.range,
        nodeId: node.id,
      });
    }
  }

  return diagnostics;
}

function computeReachable(graph: Graph): Set<string> {
  const reachable = new Set<string>();
  if (!graph.startAt) {
    return reachable;
  }
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
  }
  const queue = [graph.startAt];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (reachable.has(id)) {
      continue;
    }
    reachable.add(id);
    for (const next of adjacency.get(id) ?? []) {
      queue.push(next);
    }
  }
  return reachable;
}

/** The final path segment of a scoped node id, for user-facing messages. */
function displayName(id: string): string {
  const parts = id.split('/');
  return parts[parts.length - 1];
}
