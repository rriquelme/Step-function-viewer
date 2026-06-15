// SVG rendering of a laid-out graph. Layout (expensive, dagre) is kept separate
// from rendering (cheap) so selection/highlight changes never trigger re-layout.
import type { LaidOutEdge, LaidOutGraph, LaidOutNode } from './layout';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface RenderHandlers {
  onSelectNode(id: string): void;
  onRevealNode(id: string): void;
}

export interface HighlightState {
  selectedNodeId?: string;
  selectedVariable?: string;
  defs: Set<string>;
  refs: Set<string>;
}

/** Create the persistent SVG canvas with arrow markers and a pannable viewport group. */
export function createCanvas(): { svg: SVGSVGElement; viewport: SVGGElement } {
  const svg = svgEl('svg', { class: 'graph-svg' }) as SVGSVGElement;

  const defs = svgEl('defs');
  defs.append(arrowMarker('arrow'));
  svg.append(defs);

  const viewport = svgEl('g', { class: 'viewport' }) as SVGGElement;
  svg.append(viewport);
  return { svg, viewport };
}

/** Draw the graph into the viewport group; returns node elements keyed by id. */
export function renderInto(
  viewport: SVGGElement,
  laid: LaidOutGraph,
  handlers: RenderHandlers,
): Map<string, SVGGElement> {
  viewport.replaceChildren();

  // Edges first so nodes paint on top.
  const edgeLayer = svgEl('g', { class: 'edge-layer' });
  for (const edge of laid.edges) {
    edgeLayer.append(...renderEdge(edge));
  }
  viewport.append(edgeLayer);

  const nodeLayer = svgEl('g', { class: 'node-layer' });
  const nodeEls = new Map<string, SVGGElement>();
  for (const node of laid.nodes) {
    const g = renderNode(node, handlers);
    nodeEls.set(node.id, g);
    nodeLayer.append(g);
  }
  viewport.append(nodeLayer);

  return nodeEls;
}

/** Toggle highlight/selection classes on existing node elements (no re-render). */
export function applyHighlight(nodeEls: Map<string, SVGGElement>, state: HighlightState): void {
  const highlighting = !!state.selectedVariable;
  for (const [id, g] of nodeEls) {
    g.classList.toggle('selected', id === state.selectedNodeId);
    g.classList.toggle('def', highlighting && state.defs.has(id));
    g.classList.toggle('ref', highlighting && state.refs.has(id) && !state.defs.has(id));
    g.classList.toggle(
      'dimmed',
      highlighting && !state.defs.has(id) && !state.refs.has(id),
    );
  }
}

function renderNode(node: LaidOutNode, handlers: RenderHandlers): SVGGElement {
  const x = node.x - node.width / 2;
  const y = node.y - node.height / 2;
  const g = svgEl('g', {
    class: `node type-${node.type}${node.container ? ' container' : ''}`,
    'data-id': node.id,
    transform: `translate(${x}, ${y})`,
  }) as SVGGElement;

  const rect = svgEl('rect', {
    class: 'node-box',
    width: String(node.width),
    height: String(node.height),
    rx: '8',
    ry: '8',
  });
  g.append(rect);

  const type = svgEl('text', {
    class: 'node-type',
    x: String(node.width / 2),
    y: '18',
    'text-anchor': 'middle',
  });
  type.textContent = node.container ? `▦ ${node.type.toUpperCase()}` : node.type.toUpperCase();
  g.append(type);

  const name = svgEl('text', {
    class: 'node-name',
    x: String(node.width / 2),
    y: '37',
    'text-anchor': 'middle',
  });
  name.textContent = truncate(node.name, 32);
  g.append(name);

  g.addEventListener('click', (e) => {
    e.stopPropagation();
    handlers.onSelectNode(node.id);
  });
  g.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    handlers.onRevealNode(node.id);
  });
  return g;
}

function renderEdge(edge: LaidOutEdge): SVGElement[] {
  const out: SVGElement[] = [];
  const points = edge.points.length >= 2 ? edge.points : [];
  if (points.length === 0) {
    return out;
  }
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const path = svgEl('path', {
    class: `edge kind-${edge.kind}`,
    d,
    'marker-end': 'url(#arrow)',
  });
  out.push(path);

  if (edge.label) {
    const mid = points[Math.floor(points.length / 2)];
    const label = svgEl('text', {
      class: 'edge-label',
      x: mid.x.toFixed(1),
      y: (mid.y - 4).toFixed(1),
      'text-anchor': 'middle',
    });
    label.textContent = truncate(edge.label, 24);
    out.push(label);
  }
  return out;
}

function arrowMarker(id: string): SVGElement {
  const marker = svgEl('marker', {
    id,
    viewBox: '0 0 10 10',
    refX: '9',
    refY: '5',
    markerWidth: '7',
    markerHeight: '7',
    orient: 'auto-start-reverse',
    markerUnits: 'userSpaceOnUse',
  });
  const path = svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'arrow-head' });
  marker.append(path);
  return marker;
}

function svgEl(tag: string, attrs: Record<string, string> = {}): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
