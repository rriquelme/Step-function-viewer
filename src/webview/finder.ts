// Pure matching logic for the graph finder, kept DOM-free so it can be tested.
//
// Query convention (so a state and a variable with the same name are
// distinguishable): a leading "$" searches variables — matches are the states
// that define or reference a matching variable. Otherwise the query matches
// state name, type, resource, or invoked function name.
import type { ViewModel } from '../model/viewModel';

export type FinderMode = 'state' | 'variable';

export function finderMode(query: string): FinderMode {
  return query.trim().startsWith('$') ? 'variable' : 'state';
}

export function findMatchingNodeIds(
  model: Pick<ViewModel, 'nodes' | 'variables'>,
  query: string,
): string[] {
  const raw = query.trim();
  if (!raw || raw === '$') {
    return [];
  }

  if (raw.startsWith('$')) {
    const q = raw.slice(1).toLowerCase();
    const ids = new Set<string>();
    for (const v of model.variables) {
      if (v.name.toLowerCase().includes(q)) {
        for (const u of v.definitions) ids.add(u.nodeId);
        for (const u of v.references) ids.add(u.nodeId);
      }
    }
    // Preserve document order for stable cycling.
    return model.nodes.filter((n) => ids.has(n.id)).map((n) => n.id);
  }

  const q = raw.toLowerCase();
  return model.nodes
    .filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q) ||
        (n.resource?.toLowerCase().includes(q) ?? false) ||
        (n.functionName?.toLowerCase().includes(q) ?? false),
    )
    .map((n) => n.id);
}
