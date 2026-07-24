// Pure layered-layout computation using dagre. No DOM access, so it can be
// unit-tested and reused. Takes the abstract graph and returns positioned
// nodes, routed edges, and overall bounds.
import * as dagre from '@dagrejs/dagre';
import type { EdgeKind } from '../../asl/graph';
import { typeLabel } from './label';

export type Rankdir = 'TB' | 'LR';

export interface LayoutInputNode {
  id: string;
  name: string;
  type: string;
  container: boolean;
  parentId?: string;
  resource?: string;
  functionName?: string;
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
const TERMINAL_W = 86;
const TERMINAL_H = 58;
const CHAR_WIDTH = 7.5;
const MIN_WIDTH = 120;
const MAX_WIDTH = 300;
const ROOT_MARGIN = 24;
const SCOPE_PAD = 18; // padding between a container box and its contents
const HEADER_H = 26; // top strip of a container box reserved for its label

const ROOT = '__root__';

export function nodeWidth(name: string): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(name.length * CHAR_WIDTH) + 36));
}

function isTerminal(type: string): boolean {
  return type === 'Succeed' || type === 'Fail';
}

function leafSize(node: LayoutInputNode): { width: number; height: number } {
  if (isTerminal(node.type)) {
    return { width: Math.max(TERMINAL_W, node.name.length * CHAR_WIDTH), height: TERMINAL_H };
  }
  // Size to the wider of the name (13px) and the type/resource subtitle (~9px).
  const subtitle = typeLabel(node.type, node.resource, node.functionName);
  const base = Math.max(node.name.length * CHAR_WIDTH, subtitle.length * 6.2);
  return {
    width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(base) + 36)),
    height: NODE_HEIGHT,
  };
}

interface SubLayout {
  width: number;
  height: number;
  pos: Map<string, { x: number; y: number; w: number; h: number }>;
  subByContainer: Map<string, SubLayout>;
  routes: LaidOutEdge[];
}

/**
 * Lays out the machine with true nesting: each Parallel/Map sub-graph is laid
 * out in isolation and inserted into its parent as a single block sized to fit
 * its contents. This guarantees a container's box encloses exactly its own
 * states — siblings (e.g. a Map's `Next` successor) land outside the box.
 */
export function layoutGraph(
  nodes: LayoutInputNode[],
  edges: LayoutInputEdge[],
  rankdir: Rankdir = 'TB',
  startAt?: string,
): LaidOutGraph {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const childrenByParent = new Map<string, LayoutInputNode[]>();
  for (const n of nodes) {
    const key = n.parentId && nodeById.has(n.parentId) ? n.parentId : ROOT;
    (childrenByParent.get(key) ?? childrenByParent.set(key, []).get(key)!).push(n);
  }
  const scopeKeyOf = (id: string): string => {
    const p = nodeById.get(id)?.parentId;
    return p && nodeById.has(p) ? p : ROOT;
  };

  // Edges that transition BACK into the entry state are excluded from ranking so
  // the StartAt state always stays at the top; they are still drawn (as straight
  // connectors) below.
  const backToStart = new Set<number>();

  const layoutScope = (scopeKey: string): SubLayout => {
    const members = childrenByParent.get(scopeKey) ?? [];
    const subByContainer = new Map<string, SubLayout>();
    const g = new dagre.graphlib.Graph({ multigraph: true });
    g.setGraph({ rankdir, nodesep: 45, ranksep: 65, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));

    for (const m of members) {
      if (m.container) {
        const sub = layoutScope(m.id);
        subByContainer.set(m.id, sub);
        g.setNode(m.id, {
          width: sub.width + SCOPE_PAD * 2,
          height: sub.height + SCOPE_PAD * 2 + HEADER_H,
        });
      } else {
        g.setNode(m.id, leafSize(m));
      }
    }

    const ids = new Set(members.map((m) => m.id));
    edges.forEach((edge, i) => {
      if (!ids.has(edge.from) || !ids.has(edge.to)) {
        return;
      }
      if (scopeKey === ROOT && startAt && edge.to === startAt) {
        backToStart.add(i);
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

    const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const m of members) {
      const d = g.node(m.id);
      pos.set(m.id, { x: d.x, y: d.y, w: d.width, h: d.height });
    }
    const routes: LaidOutEdge[] = [];
    for (const e of g.edges()) {
      const original = findEdge(edges, e.v, e.w, e.name);
      if (!original) {
        continue;
      }
      const d = g.edge(e);
      routes.push({
        from: e.v,
        to: e.w,
        kind: original.kind,
        label: original.label,
        points: (d.points ?? []).map((p) => ({ x: p.x, y: p.y })),
      });
    }

    const gl = g.graph();
    return { width: gl.width ?? 0, height: gl.height ?? 0, pos, subByContainer, routes };
  };

  const laidOutNodes: LaidOutNode[] = [];
  const laidOutEdges: LaidOutEdge[] = [];
  const centers = new Map<string, Point>();

  const place = (scope: SubLayout, originX: number, originY: number): void => {
    for (const r of scope.routes) {
      laidOutEdges.push({
        ...r,
        points: r.points.map((p) => ({ x: p.x + originX, y: p.y + originY })),
      });
    }
    for (const [id, p] of scope.pos) {
      const node = nodeById.get(id)!;
      const cx = originX + p.x;
      const cy = originY + p.y;
      centers.set(id, { x: cx, y: cy });
      laidOutNodes.push({ ...node, x: cx, y: cy, width: p.w, height: p.h });
      if (node.container) {
        const sub = scope.subByContainer.get(id);
        if (sub) {
          place(sub, cx - p.w / 2 + SCOPE_PAD, cy - p.h / 2 + SCOPE_PAD + HEADER_H);
        }
      }
    }
  };

  const root = layoutScope(ROOT);
  place(root, ROOT_MARGIN, ROOT_MARGIN);

  // Draw edges not routed by a single dagre pass as straight connectors:
  //  - cross-scope edges (e.g. a Catch escaping a branch), and
  //  - back-to-start edges we excluded from ranking to keep StartAt on top.
  // `branch`/`map` entry edges are implied by containment, so we drop them.
  edges.forEach((edge, i) => {
    const crossScope = scopeKeyOf(edge.from) !== scopeKeyOf(edge.to);
    if (!crossScope && !backToStart.has(i)) {
      return;
    }
    if (edge.kind === 'branch' || edge.kind === 'map') {
      return;
    }
    const a = centers.get(edge.from);
    const b = centers.get(edge.to);
    if (a && b) {
      laidOutEdges.push({ from: edge.from, to: edge.to, kind: edge.kind, label: edge.label, points: [a, b] });
    }
  });

  return {
    nodes: laidOutNodes,
    edges: laidOutEdges,
    width: root.width + ROOT_MARGIN * 2,
    height: root.height + ROOT_MARGIN * 2,
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
