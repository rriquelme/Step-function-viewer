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
// Invisible layout anchors used to pin the entry state to the top and terminal
// states to the bottom. Filtered out of the rendered nodes/edges.
const BOTTOM = '__bottom__';
const PIN = '__pin__';

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

  // Edges excluded from vertical ranking so every ranked transition points
  // strictly downward (steps read top-to-bottom in declared flow order):
  // transitions back into the entry state, plus every loop back-edge found by a
  // DFS from each scope's entry. They are still drawn as straight connectors.
  const unranked = new Set<number>();

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
    const inScope: { from: string; to: string; kind: EdgeKind; label?: string; i: number }[] = [];
    edges.forEach((edge, i) => {
      if (ids.has(edge.from) && ids.has(edge.to)) {
        inScope.push({ from: edge.from, to: edge.to, kind: edge.kind, label: edge.label, i });
      }
    });

    // 1. Edges back into the machine's entry never participate in ranking.
    for (const e of inScope) {
      if (scopeKey === ROOT && startAt && e.to === startAt) {
        unranked.add(e.i);
      }
    }

    // 2. Find loop back-edges with a DFS in flow order (entry first, then other
    //    sources, then document order) and exclude them from ranking too. The
    //    remaining edge set is a DAG that follows the declared flow, so dagre
    //    can never reorder steps by breaking a cycle at an arbitrary edge.
    const adj = new Map<string, { to: string; i: number }[]>();
    for (const e of inScope) {
      if (!unranked.has(e.i)) {
        (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push({ to: e.to, i: e.i });
      }
    }
    const color = new Map<string, 'active' | 'done'>();
    const dfs = (u: string): void => {
      color.set(u, 'active');
      for (const { to, i } of adj.get(u) ?? []) {
        const c = color.get(to);
        if (c === 'active') {
          unranked.add(i); // closes a loop
        } else if (!c) {
          dfs(to);
        }
      }
      color.set(u, 'done');
    };
    const incoming = new Map<string, number>();
    for (const e of inScope) {
      if (!unranked.has(e.i)) {
        incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
      }
    }
    const entryOrder: string[] = [];
    if (scopeKey === ROOT && startAt && ids.has(startAt)) {
      entryOrder.push(startAt);
    }
    for (const m of members) {
      if ((incoming.get(m.id) ?? 0) === 0) {
        entryOrder.push(m.id);
      }
    }
    for (const m of members) {
      entryOrder.push(m.id);
    }
    for (const id of entryOrder) {
      if (!color.has(id)) {
        dfs(id);
      }
    }

    const inDegree = new Map<string, number>();
    for (const e of inScope) {
      if (unranked.has(e.i)) {
        continue;
      }
      const label: dagre.Label = {};
      if (e.label) {
        label.width = Math.min(160, e.label.length * 6 + 8);
        label.height = 14;
      }
      g.setEdge(e.from, e.to, label, `${e.kind}#${e.i}`);
      inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
    }

    // Root layout anchoring (invisible edges, filtered out of the output):
    //  - keep the entry state uniquely at the TOP by pushing any other
    //    source-like nodes (e.g. a Catch-only error handler) below it, and
    //  - pull terminal (Succeed/Fail) states to the BOTTOM via a virtual sink.
    if (scopeKey === ROOT) {
      let pin = 0;
      if (startAt && ids.has(startAt)) {
        for (const m of members) {
          if (m.id !== startAt && (inDegree.get(m.id) ?? 0) === 0) {
            g.setEdge(startAt, m.id, { weight: 1 }, `${PIN}${pin++}`);
          }
        }
      }
      const terminals = members.filter((m) => isTerminal(m.type));
      if (terminals.length > 0) {
        g.setNode(BOTTOM, { width: 0, height: 0 });
        for (const t of terminals) {
          g.setEdge(t.id, BOTTOM, { weight: 8 }, `${PIN}${pin++}`);
        }
      }
    }

    dagre.layout(g);

    const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const m of members) {
      const d = g.node(m.id);
      pos.set(m.id, { x: d.x, y: d.y, w: d.width, h: d.height });
    }
    const routes: LaidOutEdge[] = [];
    for (const e of g.edges()) {
      // Skip the invisible anchor edges (to the virtual bottom / pin edges).
      if (e.v === BOTTOM || e.w === BOTTOM || e.name?.startsWith(PIN)) {
        continue;
      }
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

  // Edges not routed by a dagre pass — loop back-edges and cross-scope edges —
  // are routed orthogonally around the side of the states they span, starting
  // and ending at node borders so the arrowhead stays visible. (Previously they
  // were straight center-to-center lines that cut through the diagram and hid
  // their arrowhead under the target node, looking like duplicate edges.)
  // `branch`/`map` entry edges are implied by containment, so we drop them.
  const geom = new Map(laidOutNodes.map((n) => [n.id, n]));
  let width = root.width + ROOT_MARGIN * 2;
  let height = root.height + ROOT_MARGIN * 2;
  edges.forEach((edge, i) => {
    const crossScope = scopeKeyOf(edge.from) !== scopeKeyOf(edge.to);
    if (!crossScope && !unranked.has(i)) {
      return;
    }
    if (edge.kind === 'branch' || edge.kind === 'map') {
      return;
    }
    const a = geom.get(edge.from);
    const b = geom.get(edge.to);
    if (!a || !b) {
      return;
    }
    const points = routeAround(a, b, laidOutNodes, rankdir);
    for (const p of points) {
      width = Math.max(width, p.x + ROOT_MARGIN);
      height = Math.max(height, p.y + ROOT_MARGIN);
    }
    laidOutEdges.push({ from: edge.from, to: edge.to, kind: edge.kind, label: edge.label, points });
  });

  return {
    nodes: laidOutNodes,
    edges: laidOutEdges,
    width,
    height,
  };
}

/**
 * Orthogonal route for an edge dagre didn't lay out (loop-backs, cross-scope):
 * leave the source's side border, run along a lane just outside every state the
 * edge spans vertically (TB) or horizontally (LR), and enter the target's side
 * border so the arrowhead is visible.
 */
function routeAround(
  a: LaidOutNode,
  b: LaidOutNode,
  all: LaidOutNode[],
  rankdir: Rankdir,
): Point[] {
  const GAP = 36;
  // Nudge self-loops apart so the out and return segments don't overlap.
  const selfOffset = a.id === b.id ? 12 : 0;

  if (rankdir === 'LR') {
    const minX = Math.min(a.x - a.width / 2, b.x - b.width / 2);
    const maxX = Math.max(a.x + a.width / 2, b.x + b.width / 2);
    let lane = -Infinity;
    for (const n of all) {
      if (n.x + n.width / 2 >= minX && n.x - n.width / 2 <= maxX) {
        lane = Math.max(lane, n.y + n.height / 2);
      }
    }
    lane += GAP;
    return [
      { x: a.x - selfOffset, y: a.y + a.height / 2 },
      { x: a.x - selfOffset, y: lane },
      { x: b.x + selfOffset, y: lane },
      { x: b.x + selfOffset, y: b.y + b.height / 2 },
    ];
  }

  const minY = Math.min(a.y - a.height / 2, b.y - b.height / 2);
  const maxY = Math.max(a.y + a.height / 2, b.y + b.height / 2);
  let lane = -Infinity;
  for (const n of all) {
    if (n.y + n.height / 2 >= minY && n.y - n.height / 2 <= maxY) {
      lane = Math.max(lane, n.x + n.width / 2);
    }
  }
  lane += GAP;
  return [
    { x: a.x + a.width / 2, y: a.y - selfOffset },
    { x: lane, y: a.y - selfOffset },
    { x: lane, y: b.y + selfOffset },
    { x: b.x + b.width / 2, y: b.y + selfOffset },
  ];
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
