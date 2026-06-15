// Pure layered-layout computation using dagre. No DOM access, so it can be
// unit-tested and reused. Takes the abstract graph and returns positioned
// nodes, routed edges, and overall bounds.
import * as dagre from '@dagrejs/dagre';
import type { EdgeKind } from '../../asl/graph';

export type Rankdir = 'TB' | 'LR';

export interface LayoutInputNode {
  id: string;
  name: string;
  type: string;
  container: boolean;
  parentId?: string;
}

export interface LayoutInputEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface LaidOutNode extends LayoutInputNode {
  /** Center coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaidOutEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  points: Point[];
}

export interface LaidOutGraph {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
}

const NODE_HEIGHT = 52;
const CHAR_WIDTH = 7.5;
const MIN_WIDTH = 120;
const MAX_WIDTH = 300;

export function nodeWidth(name: string): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(name.length * CHAR_WIDTH) + 36));
}

export function layoutGraph(
  nodes: LayoutInputNode[],
  edges: LayoutInputEdge[],
  rankdir: Rankdir = 'TB',
): LaidOutGraph {
  // Flat layered layout. (We intentionally avoid dagre compound/cluster nodes:
  // this dagre version throws when an edge attaches to a cluster parent, which
  // our Parallel/Map container states always do. Instead, containers are drawn
  // as distinct nodes and the `branch`/`map` edges keep the nesting legible.)
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir, nodesep: 45, ranksep: 65, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  const known = new Set(nodes.map((n) => n.id));

  for (const node of nodes) {
    g.setNode(node.id, {
      width: nodeWidth(node.name),
      height: NODE_HEIGHT,
    });
  }

  edges.forEach((edge, i) => {
    // Skip dangling transitions (already surfaced as diagnostics).
    if (!known.has(edge.from) || !known.has(edge.to)) {
      return;
    }
    const label: dagre.Label = {};
    if (edge.label) {
      label.width = Math.min(160, edge.label.length * 6 + 8);
      label.height = 14;
    }
    g.setEdge(edge.from, edge.to, label, `${edge.kind}#${i}`);
  });

  dagre.layout(g);

  const laidOutNodes: LaidOutNode[] = nodes
    .filter((n) => g.hasNode(n.id))
    .map((n) => {
      const d = g.node(n.id);
      return { ...n, x: d.x, y: d.y, width: d.width, height: d.height };
    });

  const laidOutEdges: LaidOutEdge[] = [];
  for (const e of g.edges()) {
    const original = findEdge(edges, e.v, e.w, e.name);
    if (!original) {
      continue;
    }
    const d = g.edge(e);
    laidOutEdges.push({
      from: e.v,
      to: e.w,
      kind: original.kind,
      label: original.label,
      points: (d.points ?? []).map((p) => ({ x: p.x, y: p.y })),
    });
  }

  const graphLabel = g.graph();
  return {
    nodes: laidOutNodes,
    edges: laidOutEdges,
    width: graphLabel.width ?? 0,
    height: graphLabel.height ?? 0,
  };
}

function findEdge(
  edges: LayoutInputEdge[],
  from: string,
  to: string,
  name?: string,
): LayoutInputEdge | undefined {
  const index = name ? Number(name.split('#')[1]) : NaN;
  if (!Number.isNaN(index) && edges[index]?.from === from && edges[index]?.to === to) {
    return edges[index];
  }
  return edges.find((e) => e.from === from && e.to === to);
}
