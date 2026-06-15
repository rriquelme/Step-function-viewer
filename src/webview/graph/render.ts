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

  // Scope boxes behind everything, so the extent of each Parallel/Map is clear.
  viewport.append(renderScopeBoxes(laid));

  // Edges next so nodes paint on top.
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
 * Draw a translucent boxed region around each Parallel/Map container and all of
 * its nested states, so the scope of each is obvious (à la Workflow Studio).
 * Membership is derived from the scope-qualified node ids (e.g. "Map/item/Step").
 */
function renderScopeBoxes(laid: LaidOutGraph): SVGGElement {
  const layer = svgEl('g', { class: 'scope-layer' }) as SVGGElement;
  // Outer containers first so nested ones paint on top.
  const containers = laid.nodes
    .filter((n) => n.container)
    .sort((a, b) => a.id.split('/').length - b.id.split('/').length);

  for (const c of containers) {
    const members = laid.nodes.filter((n) => n.id === c.id || n.id.startsWith(`${c.id}/`));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const m of members) {
      minX = Math.min(minX, m.x - m.width / 2);
      maxX = Math.max(maxX, m.x + m.width / 2);
      minY = Math.min(minY, m.y - m.height / 2);
      maxY = Math.max(maxY, m.y + m.height / 2);
    }
    if (!Number.isFinite(minX)) {
      continue;
    }
    const pad = 16;
    const labelGap = 20;
    const x = minX - pad;
    const y = minY - pad - labelGap;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2 + labelGap;
    const kind = c.type === 'Map' ? 'map' : 'parallel';

    const g = svgEl('g', { class: `scope ${kind}` });
    g.append(
      svgEl('rect', {
        class: 'scope-box',
        x: x.toFixed(1),
        y: y.toFixed(1),
        width: w.toFixed(1),
        height: h.toFixed(1),
        rx: '10',
        ry: '10',
      }),
    );
    const label = svgEl('text', {
      class: 'scope-label',
      x: (x + 12).toFixed(1),
      y: (y + 15).toFixed(1),
    });
    label.textContent = `${c.type.toUpperCase()}: ${truncate(c.name, 28)}`;
    g.append(label);
    layer.append(g);
  }
  return layer;
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

function renderNode(node: LaidOutNode, handlers: RenderHandlers): SVGGElement {
  const x = node.x - node.width / 2;
  const y = node.y - node.height / 2;
  const g = svgEl('g', {
    class: `node type-${node.type}${node.container ? ' container' : ''}`,
    'data-id': node.id,
    transform: `translate(${x}, ${y})`,
    tabindex: '0',
    role: 'button',
    'aria-label': `${node.type} state ${node.name}`,
  }) as SVGGElement;

  const title = svgEl('title');
  title.textContent = `${node.type}: ${node.name}`;
  g.append(title);

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
