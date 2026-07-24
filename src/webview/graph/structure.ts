// A cheap structural fingerprint of the graph + layout direction. When it is
// unchanged between updates, the (expensive) dagre layout can be reused and only
// the highlight/selection state needs to be re-applied.
import type { LayoutInputEdge, LayoutInputNode, Rankdir } from './layout';

export function structureHash(
  nodes: LayoutInputNode[],
  edges: LayoutInputEdge[],
  rankdir: Rankdir,
  startAt?: string,
): string {
  const n = nodes.map((x) => `${x.id}:${x.type}:${x.parentId ?? ''}`).join('|');
  const e = edges.map((x) => `${x.from}>${x.to}:${x.kind}`).join('|');
  return `${rankdir}#${startAt ?? ''}#${n}#${e}`;
}
