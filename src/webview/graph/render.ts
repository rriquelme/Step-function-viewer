// SVG rendering of a laid-out graph. Layout (expensive, dagre) is kept separate
// from rendering (cheap) so selection/highlight changes never trigger re-layout.
import type { LaidOutEdge, LaidOutGraph, LaidOutNode } from './layout';
import { typeLabel } from './label';

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
  defs.append(arrowMarker('data-arrow'));
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

  // Edges first so nodes paint on top. (Container boxes are nodes themselves and
  // are emitted parent-before-child, so a container paints behind its contents.)
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

  // Empty overlay for data-flow edges (drawn on demand by updateDataFlow).
  viewport.append(svgEl('g', { class: 'data-flow-layer' }));

  return nodeEls;
}

/**
 * Draw "data-flow" edges from each defining state to each referencing state for
 * the selected variable, overlaid on the control-flow graph. Pass empty sets to
 * clear the overlay.
 */
export function updateDataFlow(
  viewport: SVGGElement,
  laid: LaidOutGraph,
  defs: Set<string>,
  refs: Set<string>,
): void {
  const layer = viewport.querySelector('g.data-flow-layer');
  if (!layer) {
    return;
  }
  layer.replaceChildren();
  if (defs.size === 0 || refs.size === 0) {
    return;
  }
  const centers = new Map(laid.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  for (const from of defs) {
    for (const to of refs) {
      if (from === to) {
        continue;
      }
      const a = centers.get(from);
      const b = centers.get(to);
      if (!a || !b) {
        continue;
      }
      // Quadratic curve bowed perpendicular to the line for legibility.
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const bow = Math.min(60, len * 0.2);
      const cx = mx - (dy / len) * bow;
      const cy = my + (dx / len) * bow;
      layer.append(
        svgEl('path', {
          class: 'data-edge',
          d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
          'marker-end': 'url(#data-arrow)',
        }),
      );
    }
  }
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

/** Mark finder matches; `currentId` gets the focused style. Empty set clears. */
export function applyMatches(
  nodeEls: Map<string, SVGGElement>,
  matches: Set<string>,
  currentId: string | undefined,
): void {
  for (const [id, g] of nodeEls) {
    g.classList.toggle('match', matches.has(id));
    g.classList.toggle('match-current', id === currentId);
  }
}

function renderNode(node: LaidOutNode, handlers: RenderHandlers): SVGGElement {
  const x = node.x - node.width / 2;
  const y = node.y - node.height / 2;
  const terminal = node.type === 'Succeed' || node.type === 'Fail';
  const g = svgEl('g', {
    class: `node type-${node.type}${node.container ? ' container' : ''}${terminal ? ' terminal' : ''}`,
    'data-id': node.id,
    transform: `translate(${x}, ${y})`,
    tabindex: '0',
    role: 'button',
    'aria-label': `${node.type} state ${node.name}`,
  }) as SVGGElement;

  const title = svgEl('title');
  title.textContent = node.resource
    ? `${node.type}: ${node.name}\n${node.resource}`
    : `${node.type}: ${node.name}`;
  g.append(title);

  if (node.container) {
    // The container is the scope box; its children are drawn inside it.
    g.append(
      svgEl('rect', {
        class: 'node-box',
        width: String(node.width),
        height: String(node.height),
        rx: '10',
        ry: '10',
      }),
    );
    const header = svgEl('text', { class: 'node-header', x: '12', y: '17' });
    header.textContent = `${node.type.toUpperCase()}: ${truncate(node.name, 30)}`;
    g.append(header);
  } else if (terminal) {
    // Terminal state: a small "end" ball with a glyph and a label beneath it.
    const cx = node.width / 2;
    g.append(svgEl('circle', { class: 'end-ball', cx: String(cx), cy: '18', r: '14' }));
    const glyph = svgEl('text', { class: 'end-glyph', x: String(cx), y: '23', 'text-anchor': 'middle' });
    glyph.textContent = node.type === 'Succeed' ? '✓' : '✕';
    g.append(glyph);
    const name = svgEl('text', { class: 'node-name', x: String(cx), y: '46', 'text-anchor': 'middle' });
    name.textContent = truncate(node.name, 24);
    g.append(name);
  } else {
    g.append(
      svgEl('rect', { class: 'node-box', width: String(node.width), height: String(node.height), rx: '8', ry: '8' }),
    );
    const type = svgEl('text', { class: 'node-type', x: String(node.width / 2), y: '18', 'text-anchor': 'middle' });
    type.textContent = truncate(typeLabel(node.type, node.resource, node.functionName), 40);
    g.append(type);
    const name = svgEl('text', { class: 'node-name', x: String(node.width / 2), y: '37', 'text-anchor': 'middle' });
    name.textContent = truncate(node.name, 32);
    g.append(name);
  }

  g.addEventListener('click', (e) => {
    e.stopPropagation();
    handlers.onSelectNode(node.id);
  });
  g.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    handlers.onRevealNode(node.id);
  });
  g.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handlers.onSelectNode(node.id);
    }
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
