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

describe('StartAt stays on top', () => {
  const loopNodes: LayoutInputNode[] = [
    { id: 'Start', name: 'Start', type: 'Task', container: false },
    { id: 'Work', name: 'Work', type: 'Task', container: false },
    { id: 'Retry', name: 'Retry', type: 'Choice', container: false },
  ];
  // A back-edge from Retry to Start would normally push Start below it.
  const loopEdges: LayoutInputEdge[] = [
    { from: 'Start', to: 'Work', kind: 'next' },
    { from: 'Work', to: 'Retry', kind: 'next' },
    { from: 'Retry', to: 'Start', kind: 'choice' },
  ];

  it('keeps the entry state above the states that loop back to it', () => {
    const laid = layoutGraph(loopNodes, loopEdges, 'TB', 'Start');
    const y = (id: string) => laid.nodes.find((n) => n.id === id)!.y;
    expect(y('Start')).toBeLessThan(y('Work'));
    expect(y('Start')).toBeLessThan(y('Retry'));
    // The back-edge is still drawn.
    expect(laid.edges.some((e) => e.from === 'Retry' && e.to === 'Start')).toBe(true);
  });

  it('pins the entry to the top and terminals to the bottom (wide machine)', () => {
    // "ErrHandler" has no normal incoming edge (as if reached only by a Catch),
    // so without pinning it would share the top rank with the entry state.
    const wideNodes: LayoutInputNode[] = [
      { id: 'Init', name: 'Init', type: 'Task', container: false },
      { id: 'Work', name: 'Work', type: 'Task', container: false },
      { id: 'ErrHandler', name: 'ErrHandler', type: 'Task', container: false },
      { id: 'Done', name: 'Done', type: 'Succeed', container: false },
      { id: 'Failed', name: 'Failed', type: 'Fail', container: false },
    ];
    const wideEdges: LayoutInputEdge[] = [
      { from: 'Init', to: 'Work', kind: 'next' },
      { from: 'Work', to: 'Done', kind: 'next' },
      { from: 'ErrHandler', to: 'Failed', kind: 'next' },
    ];
    const laid = layoutGraph(wideNodes, wideEdges, 'TB', 'Init');
    const y = (id: string) => laid.nodes.find((n) => n.id === id)!.y;
    const ys = laid.nodes.map((n) => n.y);

    // Entry is strictly the topmost block.
    expect(y('Init')).toBe(Math.min(...ys));
    expect(y('Init')).toBeLessThan(y('ErrHandler'));

    // Both terminals sit on the bottom row.
    const bottom = Math.max(...ys);
    expect(y('Done')).toBe(bottom);
    expect(y('Failed')).toBe(bottom);
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

function encloses(box: { x: number; y: number; width: number; height: number }, inner: { x: number; y: number; width: number; height: number }): boolean {
  return (
    inner.x - inner.width / 2 >= box.x - box.width / 2 &&
    inner.x + inner.width / 2 <= box.x + box.width / 2 &&
    inner.y - inner.height / 2 >= box.y - box.height / 2 &&
    inner.y + inner.height / 2 <= box.y + box.height / 2
  );
}

describe('containers and nested states', () => {
  it('sizes the container box to enclose its child states', () => {
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
    const parent = laid.nodes.find((n) => n.id === 'P')!;
    const child = laid.nodes.find((n) => n.id === 'P/b0/X')!;
    // branch entry edges are implied by containment, not drawn.
    expect(laid.edges.some((e) => e.kind === 'branch')).toBe(false);
    expect(encloses(parent, child)).toBe(true);
  });

  it("places a container's Next successor OUTSIDE its box", () => {
    // Regression for the "is Done inside the Map?" ambiguity.
    const nodes: LayoutInputNode[] = [
      { id: 'M', name: 'M', type: 'Map', container: true },
      { id: 'M/item/Step', name: 'Step', type: 'Pass', container: false, parentId: 'M' },
      { id: 'Done', name: 'Done', type: 'Succeed', container: false },
    ];
    const edges: LayoutInputEdge[] = [
      { from: 'M', to: 'M/item/Step', kind: 'map' },
      { from: 'M', to: 'Done', kind: 'next' },
    ];
    const laid = layoutGraph(nodes, edges, 'TB');
    const box = laid.nodes.find((n) => n.id === 'M')!;
    const step = laid.nodes.find((n) => n.id === 'M/item/Step')!;
    const done = laid.nodes.find((n) => n.id === 'Done')!;
    expect(encloses(box, step)).toBe(true);
    expect(encloses(box, done)).toBe(false);
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
    // The two containers (PriorityFulfillment, ShipItems) are present as nodes,
    // and each encloses its own children but not the shared "Done" successor.
    const containers = laid.nodes.filter((n) => n.container);
    expect(containers.length).toBeGreaterThanOrEqual(2);
    const done = laid.nodes.find((n) => n.id === 'Done')!;
    for (const c of containers) {
      const children = laid.nodes.filter((n) => n.id.startsWith(`${c.id}/`));
      for (const child of children) {
        expect(encloses(c, child)).toBe(true);
      }
      expect(encloses(c, done)).toBe(false);
    }
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
