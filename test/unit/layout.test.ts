import { describe, expect, it } from 'vitest';
import {
  type LayoutInputEdge,
  type LayoutInputNode,
  layoutGraph,
  nodeWidth,
} from '../../src/webview/graph/layout';
import { structureHash } from '../../src/webview/graph/structure';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildViewModel } from '../../src/model/viewModel';

const nodes: LayoutInputNode[] = [
  { id: 'A', name: 'A', type: 'Pass', container: false },
  { id: 'B', name: 'B', type: 'Task', container: false },
  { id: 'C', name: 'C', type: 'Succeed', container: false },
];
const edges: LayoutInputEdge[] = [
  { from: 'A', to: 'B', kind: 'next' },
  { from: 'B', to: 'C', kind: 'next', label: 'ok' },
];

describe('nodeWidth', () => {
  it('clamps to the min/max width range', () => {
    expect(nodeWidth('x')).toBeGreaterThanOrEqual(120);
    expect(nodeWidth('x'.repeat(200))).toBeLessThanOrEqual(300);
  });
});

describe('layoutGraph', () => {
  it('positions every node and routes every edge with points', () => {
    const laid = layoutGraph(nodes, edges, 'TB');
    expect(laid.nodes).toHaveLength(3);
    expect(laid.width).toBeGreaterThan(0);
    expect(laid.height).toBeGreaterThan(0);
    for (const n of laid.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
    expect(laid.edges).toHaveLength(2);
    for (const e of laid.edges) {
      expect(e.points.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('skips dangling edges to unknown targets', () => {
    const laid = layoutGraph(nodes, [{ from: 'A', to: 'Missing', kind: 'next' }], 'TB');
    expect(laid.edges).toHaveLength(0);
  });

  it('produces different layouts for TB vs LR', () => {
    const tb = layoutGraph(nodes, edges, 'TB');
    const lr = layoutGraph(nodes, edges, 'LR');
    // For a vertical chain, TB should be taller than wide and LR the reverse.
    expect(tb.height).toBeGreaterThan(lr.height);
    expect(lr.width).toBeGreaterThan(tb.width);
  });
});

describe('containers and nested states', () => {
  it('keeps branch/map entry edges so container -> child nesting stays visible', () => {
    const clustered: LayoutInputNode[] = [
      { id: 'P', name: 'P', type: 'Parallel', container: true },
      { id: 'P/b0/X', name: 'X', type: 'Pass', container: false, parentId: 'P' },
      { id: 'P/b0/Y', name: 'Y', type: 'Pass', container: false, parentId: 'P' },
    ];
    const clusterEdges: LayoutInputEdge[] = [
      { from: 'P', to: 'P/b0/X', kind: 'branch' },
      { from: 'P/b0/X', to: 'P/b0/Y', kind: 'next' },
    ];
    const laid = layoutGraph(clustered, clusterEdges, 'TB');
    expect(laid.nodes).toHaveLength(3);
    expect(laid.edges.some((e) => e.kind === 'branch' && e.to === 'P/b0/X')).toBe(true);
    // The container sits above its child in a top-to-bottom layout.
    const parent = laid.nodes.find((n) => n.id === 'P')!;
    const child = laid.nodes.find((n) => n.id === 'P/b0/X')!;
    expect(parent.y).toBeLessThan(child.y);
  });

  it('lays out the bundled example (Parallel + Map) without throwing', () => {
    const text = readFileSync(
      resolve(__dirname, '../../examples/order-processing.asl.json'),
      'utf8',
    );
    const model = buildViewModel(text);
    const inputs = {
      nodes: model.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        container: n.container,
        parentId: n.parentId,
      })),
      edges: model.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind, label: e.label })),
    };
    const laid = layoutGraph(inputs.nodes, inputs.edges, 'TB');
    expect(laid.nodes.length).toBe(model.nodes.length);
    expect(laid.width).toBeGreaterThan(0);
    // The two containers (PriorityFulfillment, ShipItems) are present as nodes.
    const containers = laid.nodes.filter((n) => n.container);
    expect(containers.length).toBeGreaterThanOrEqual(2);
    // Their branch/map entry edges are routed.
    expect(laid.edges.some((e) => e.kind === 'branch')).toBe(true);
    expect(laid.edges.some((e) => e.kind === 'map')).toBe(true);
  });
});

describe('structureHash', () => {
  it('is stable for identical structure and changes when edges change', () => {
    const a = structureHash(nodes, edges, 'TB');
    const b = structureHash(nodes, edges, 'TB');
    expect(a).toBe(b);

    const changed = structureHash(nodes, [{ from: 'A', to: 'C', kind: 'next' }], 'TB');
    expect(changed).not.toBe(a);

    expect(structureHash(nodes, edges, 'LR')).not.toBe(a);
  });
});
