// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { layoutGraph } from '../../src/webview/graph/layout';
import { applyHighlight, createCanvas, renderInto } from '../../src/webview/graph/render';

const nodes = [
  { id: 'A', name: 'A', type: 'Pass', container: false },
  { id: 'B', name: 'B', type: 'Task', container: false },
  { id: 'P', name: 'P', type: 'Parallel', container: true },
];
const edges = [
  { from: 'A', to: 'B', kind: 'next' as const, label: undefined },
  { from: 'B', to: 'P', kind: 'next' as const, label: 'go' },
];

function renderGraph() {
  const laid = layoutGraph(nodes, edges, 'TB');
  const { svg, viewport } = createCanvas();
  const nodeEls = renderInto(viewport, laid, {
    onSelectNode: () => {},
    onRevealNode: () => {},
  });
  return { svg, nodeEls };
}

describe('render', () => {
  it('draws a node group per state and a path per edge', () => {
    const { svg, nodeEls } = renderGraph();
    expect(nodeEls.size).toBe(3);
    expect(svg.querySelectorAll('g.node').length).toBe(3);
    expect(svg.querySelectorAll('path.edge').length).toBe(2);
    // Arrow marker is defined.
    expect(svg.querySelector('marker#arrow')).not.toBeNull();
  });

  it('marks container nodes with the container class', () => {
    const { nodeEls } = renderGraph();
    expect(nodeEls.get('P')!.classList.contains('container')).toBe(true);
    expect(nodeEls.get('A')!.classList.contains('container')).toBe(false);
  });

  it('applyHighlight toggles def/ref/dimmed/selected classes', () => {
    const { nodeEls } = renderGraph();
    applyHighlight(nodeEls, {
      selectedNodeId: 'B',
      selectedVariable: 'x',
      defs: new Set(['A']),
      refs: new Set(['B']),
    });
    expect(nodeEls.get('A')!.classList.contains('def')).toBe(true);
    expect(nodeEls.get('B')!.classList.contains('ref')).toBe(true);
    expect(nodeEls.get('B')!.classList.contains('selected')).toBe(true);
    expect(nodeEls.get('P')!.classList.contains('dimmed')).toBe(true);

    // Clearing the variable removes highlight classes.
    applyHighlight(nodeEls, {
      selectedNodeId: undefined,
      selectedVariable: undefined,
      defs: new Set(),
      refs: new Set(),
    });
    expect(nodeEls.get('A')!.classList.contains('def')).toBe(false);
    expect(nodeEls.get('P')!.classList.contains('dimmed')).toBe(false);
  });
});
