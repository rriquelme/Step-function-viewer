// Builds the serializable view model handed to the webview. This is the single
// boundary between the (vscode-free, unit-testable) ASL logic and the UI.
import { type Graph, type GraphNode, buildGraph } from '../asl/graph';
import { type DocumentFormat, parseDocument } from '../asl/document';
import { effectiveQueryLanguage, machineQueryLanguage } from '../asl/queryLanguage';
import { type Diagnostic, validateStateMachine } from '../asl/validate';
import { type StateVariableSummary, type VariableInfo, analyzeVariables } from '../analysis/variables';
import type { QueryLanguage } from '../asl/types';

export interface ViewNode extends GraphNode {
  queryLanguage: QueryLanguage;
  /** Variables this state creates and uses (for the click-a-state menu). */
  variables: StateVariableSummary;
}

export interface ViewModel {
  /** False when the document is not a parseable state machine. */
  ok: boolean;
  startAt?: string;
  queryLanguage: QueryLanguage;
  nodes: ViewNode[];
  edges: Graph['edges'];
  diagnostics: Diagnostic[];
  /** Per-variable definition/reference index for cross-state highlighting. */
  variables: VariableInfo[];
}

const EMPTY_SUMMARY: StateVariableSummary = { created: [], used: [] };

export function buildViewModel(text: string, format: DocumentFormat = 'json'): ViewModel {
  const { machine, rangeAt, errors } = parseDocument(text, format);
  const graph = buildGraph(machine, rangeAt);
  const diagnostics = validateStateMachine(machine, graph, rangeAt);
  const analysis = analyzeVariables(machine, graph, rangeAt);

  for (const err of errors) {
    diagnostics.unshift({ message: err.message, severity: 'error', range: err.range });
  }

  const nodes: ViewNode[] = graph.nodes.map((node) => ({
    ...node,
    queryLanguage: effectiveQueryLanguage(
      machine,
      machine?.States?.[node.jsonPath[node.jsonPath.length - 1] as string],
    ),
    variables: analysis.perState[node.id] ?? EMPTY_SUMMARY,
  }));

  return {
    ok: !!machine && !!machine.States,
    startAt: graph.startAt,
    queryLanguage: machineQueryLanguage(machine),
    nodes,
    edges: graph.edges,
    diagnostics,
    variables: analysis.variables,
  };
}
