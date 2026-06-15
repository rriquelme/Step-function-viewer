// Builds the serializable view model handed to the webview. This is the single
// boundary between the (vscode-free, unit-testable) ASL logic and the UI.
import { type Graph, type GraphNode, buildGraph } from '../asl/graph';
import { parseStateMachine } from '../asl/parser';
import { effectiveQueryLanguage, machineQueryLanguage } from '../asl/queryLanguage';
import { type Diagnostic, validateStateMachine } from '../asl/validate';
import type { QueryLanguage } from '../asl/types';

export interface ViewNode extends GraphNode {
  queryLanguage: QueryLanguage;
}

export interface ViewModel {
  /** False when the document is not a parseable state machine. */
  ok: boolean;
  startAt?: string;
  queryLanguage: QueryLanguage;
  nodes: ViewNode[];
  edges: Graph['edges'];
  diagnostics: Diagnostic[];
}

export function buildViewModel(text: string): ViewModel {
  const { machine, tree, errors } = parseStateMachine(text);
  const graph = buildGraph(machine, tree);
  const diagnostics = validateStateMachine(machine, graph, tree);

  for (const err of errors) {
    diagnostics.unshift({
      message: `JSON syntax error (code ${err.error}).`,
      severity: 'error',
      range: { start: err.offset, end: err.offset + err.length },
    });
  }

  const nodes: ViewNode[] = graph.nodes.map((node) => ({
    ...node,
    queryLanguage: effectiveQueryLanguage(
      machine,
      machine?.States?.[node.jsonPath[node.jsonPath.length - 1] as string],
    ),
  }));

  return {
    ok: !!machine && !!machine.States,
    startAt: graph.startAt,
    queryLanguage: machineQueryLanguage(machine),
    nodes,
    edges: graph.edges,
    diagnostics,
  };
}
