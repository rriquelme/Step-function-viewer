// Webview entry point: an interactive SVG graph of the state machine plus a
// variable sidebar. Clicking a state selects it (sidebar shows the variables it
// creates/uses); clicking a variable highlights every state that defines (green)
// or references (blue) it — the extension's differentiator, on the graph.
import './style.css';
import type { ExtensionToWebview, ViewOptions, WebviewToExtension } from '../shared/protocol';
import type { ViewModel, ViewNode } from '../model/viewModel';
import type { VariableInfo } from '../analysis/variables';
import {
  type LaidOutGraph,
  type LayoutInputEdge,
  type LayoutInputNode,
  layoutGraph,
} from './graph/layout';
import {
  applyHighlight,
  applyMatches,
  createCanvas,
  renderInto,
  updateDataFlow,
} from './graph/render';
import { Viewport } from './graph/viewport';
import { structureHash } from './graph/structure';
import { finderMode, findMatchingNodeIds } from './finder';

interface VsCodeApi {
  postMessage(message: WebviewToExtension): void;
  getState(): unknown;
  setState(state: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const root = document.getElementById('app')!;

// --- view state ---
let model: ViewModel | undefined;
let options: ViewOptions = { layoutDirection: 'TB' };
let selectedNodeId: string | undefined;
let selectedVariable: string | undefined;

// Finder state.
let finderQuery = '';
let finderMatches: string[] = [];
let finderIndex = 0;
let finderCountEl: HTMLElement | undefined;

// --- persistent graph objects (survive selection changes to preserve zoom) ---
let svg: SVGSVGElement | undefined;
let viewportGroup: SVGGElement | undefined;
let viewport: Viewport | undefined;
let nodeEls = new Map<string, SVGGElement>();
let lastLayout: LaidOutGraph | undefined;
let lastHash = '';

// DOM regions rebuilt on selection (cheap).
let toolbarEl: HTMLElement | undefined;
let sidebarEl: HTMLElement | undefined;

function post(message: WebviewToExtension): void {
  vscode.postMessage(message);
}

function toLayoutInputs(m: ViewModel): { nodes: LayoutInputNode[]; edges: LayoutInputEdge[] } {
  return {
    nodes: m.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      container: n.container,
      parentId: n.parentId,
    })),
    edges: m.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind, label: e.label })),
  };
}

function highlightSets(): { defs: Set<string>; refs: Set<string> } {
  const defs = new Set<string>();
  const refs = new Set<string>();
  if (selectedVariable && model) {
    const info = model.variables.find((v) => v.name === selectedVariable);
    info?.definitions.forEach((u) => defs.add(u.nodeId));
    info?.references.forEach((u) => refs.add(u.nodeId));
  }
  return { defs, refs };
}

function selectVariable(name: string | undefined): void {
  selectedVariable = selectedVariable === name ? undefined : name;
  if (selectedVariable) {
    post({ type: 'selectVariable', variable: selectedVariable });
  }
  refreshHighlight();
}

function selectNode(id: string): void {
  selectedNodeId = selectedNodeId === id ? undefined : id;
  refreshHighlight();
}

// --- finder: search states (plain) or variables (leading "$") ---
function recomputeFinder(): void {
  finderMatches = model ? findMatchingNodeIds(model, finderQuery) : [];
  if (finderIndex >= finderMatches.length) {
    finderIndex = 0;
  }
  applyMatches(nodeEls, new Set(finderMatches), finderMatches[finderIndex]);
  updateFinderCount();
}

function updateFinderCount(): void {
  if (!finderCountEl) {
    return;
  }
  const q = finderQuery.trim();
  if (!q || q === '$') {
    finderCountEl.textContent = '';
    return;
  }
  const prefix = finderMode(q) === 'variable' ? 'var ' : '';
  finderCountEl.textContent = finderMatches.length
    ? `${prefix}${finderIndex + 1}/${finderMatches.length}`
    : `${prefix}0/0`;
}

function gotoMatch(delta: number): void {
  if (finderMatches.length === 0) {
    return;
  }
  finderIndex = (finderIndex + delta + finderMatches.length) % finderMatches.length;
  applyMatches(nodeEls, new Set(finderMatches), finderMatches[finderIndex]);
  updateFinderCount();
  centerCurrentMatch();
}

function centerCurrentMatch(): void {
  const id = finderMatches[finderIndex];
  const node = lastLayout?.nodes.find((n) => n.id === id);
  if (node && viewport) {
    viewport.centerOn(node.x, node.y);
  }
}

/** Re-apply highlight classes and rebuild the cheap DOM (toolbar + sidebar). */
function refreshHighlight(): void {
  const sets = highlightSets();
  applyHighlight(nodeEls, { selectedNodeId, selectedVariable, ...sets });
  if (viewportGroup && lastLayout) {
    updateDataFlow(viewportGroup, lastLayout, sets.defs, sets.refs);
  }
  rebuildToolbar();
  rebuildSidebar();
}

function render(): void {
  if (!model) {
    return;
  }
  root.replaceChildren();

  toolbarEl = el('div', 'toolbar');
  root.append(toolbarEl);

  const content = el('div', 'content');
  if (!model.ok) {
    content.append(
      para('This document is not a valid Amazon States Language state machine.', 'placeholder'),
    );
    root.append(content);
    teardownGraph();
    rebuildToolbar();
    return;
  }

  const layout = el('div', 'layout');
  const graphContainer = el('div', 'graph-container');
  layout.append(graphContainer);
  sidebarEl = el('div', 'sidebar');
  layout.append(sidebarEl);
  content.append(layout);

  if (model.diagnostics.length > 0) {
    content.append(renderDiagnostics(model));
  }
  root.append(content);

  mountGraph(graphContainer);
  rebuildToolbar();
  rebuildSidebar();
}

function mountGraph(container: HTMLElement): void {
  if (!model) {
    return;
  }
  const { nodes, edges } = toLayoutInputs(model);
  const hash = structureHash(nodes, edges, options.layoutDirection);

  const canvas = createCanvas();
  svg = canvas.svg;
  viewportGroup = canvas.viewport;
  container.append(svg);
  viewport?.dispose();
  viewport = new Viewport(svg, viewportGroup);

  // Reuse the previous layout when the structure is unchanged (e.g. an edit
  // that only touched expressions), otherwise recompute it.
  if (!lastLayout || hash !== lastHash) {
    lastLayout = layoutGraph(nodes, edges, options.layoutDirection);
    lastHash = hash;
  }

  nodeEls = renderInto(viewportGroup, lastLayout, {
    onSelectNode: selectNode,
    onRevealNode: (id) => post({ type: 'selectState', nodeId: id }),
  });
  const sets = highlightSets();
  applyHighlight(nodeEls, { selectedNodeId, selectedVariable, ...sets });
  updateDataFlow(viewportGroup, lastLayout, sets.defs, sets.refs);
  recomputeFinder();
  viewport.fit({ width: lastLayout.width, height: lastLayout.height });
}

function teardownGraph(): void {
  viewport?.dispose();
  viewport = undefined;
  svg = undefined;
  viewportGroup = undefined;
  nodeEls = new Map();
}

// --- toolbar ---
function rebuildToolbar(): void {
  if (!toolbarEl || !model) {
    return;
  }
  toolbarEl.replaceChildren();
  toolbarEl.append(strong('Step Function Viewer'));
  toolbarEl.append(badge(`Query: ${model.queryLanguage}`));
  if (model.startAt) {
    toolbarEl.append(badge(`StartAt: ${model.startAt}`));
  }
  toolbarEl.append(badge(`${model.nodes.length} states`));
  toolbarEl.append(badge(`${model.variables.length} variables`));

  if (model.ok) {
    toolbarEl.append(renderFinder());
    const controls = el('div', 'view-controls');
    controls.append(iconButton('+', 'Zoom in', () => viewport?.zoomIn()));
    controls.append(iconButton('−', 'Zoom out', () => viewport?.zoomOut()));
    controls.append(iconButton('⤢', 'Fit', () => lastLayout && viewport?.fit(lastLayout)));
    controls.append(iconButton('⟲', 'Reset', () => viewport?.reset()));
    toolbarEl.append(controls);
  }

  if (selectedVariable) {
    const clear = button(`Clear highlight: $${selectedVariable} ✕`, 'clear-btn');
    clear.addEventListener('click', () => selectVariable(undefined));
    toolbarEl.append(clear);
  }
}

function renderFinder(): HTMLElement {
  const wrap = el('div', 'finder');
  const input = el('input', 'finder-input') as HTMLInputElement;
  input.type = 'search';
  input.placeholder = 'Find state / function — $name for variables';
  input.value = finderQuery;
  input.setAttribute('aria-label', 'Find state or function; prefix with $ to find a variable');
  input.title = 'Type to find states by name/type/function. Prefix with $ to find a variable (e.g. $orderId).';
  input.addEventListener('input', () => {
    finderQuery = input.value;
    finderIndex = 0;
    recomputeFinder();
    if (finderMatches.length) {
      centerCurrentMatch();
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      gotoMatch(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      finderQuery = '';
      input.value = '';
      recomputeFinder();
    }
  });
  wrap.append(input);

  finderCountEl = el('span', 'finder-count');
  wrap.append(finderCountEl);
  wrap.append(iconButton('‹', 'Previous match', () => gotoMatch(-1)));
  wrap.append(iconButton('›', 'Next match', () => gotoMatch(1)));
  updateFinderCount();
  return wrap;
}

// --- sidebar ---
function rebuildSidebar(): void {
  if (!sidebarEl || !model) {
    return;
  }
  sidebarEl.replaceChildren();

  const selected = selectedNodeId ? model.nodes.find((n) => n.id === selectedNodeId) : undefined;
  if (selected) {
    sidebarEl.append(renderSelectedState(selected));
  }

  sidebarEl.append(heading('Variables'));
  if (model.variables.length === 0) {
    sidebarEl.append(para('No user variables found.', 'placeholder'));
  } else {
    sidebarEl.append(renderVariableList(model));
  }
  if (selectedVariable) {
    sidebarEl.append(renderVariableDetail(model.variables.find((v) => v.name === selectedVariable)));
  }

  sidebarEl.append(renderLegend());
}

function renderLegend(): HTMLElement {
  const legend = el('div', 'legend');
  legend.append(heading('Legend'));
  const items: [string, string][] = [
    ['swatch parallel', 'Parallel scope'],
    ['swatch map', 'Map scope'],
    ['swatch def', 'Defines the selected variable'],
    ['swatch ref', 'References the selected variable'],
    ['swatch data', 'Data flow (definition → reference)'],
  ];
  for (const [cls, label] of items) {
    const row = el('div', 'legend-row');
    row.append(el('span', cls));
    row.append(span(label, 'legend-label'));
    legend.append(row);
  }
  return legend;
}

function renderSelectedState(node: ViewNode): HTMLElement {
  const panel = el('div', 'selected-panel');
  const header = el('div', 'selected-header');
  header.append(span(node.type, 'type'));
  header.append(span(node.name, 'name'));
  const src = button('source ⤴', 'src-btn');
  src.addEventListener('click', () => post({ type: 'selectState', nodeId: node.id }));
  header.append(src);
  panel.append(header);
  panel.append(renderChipGroup('Creates', node.variables.created, 'create'));
  panel.append(renderChipGroup('Uses', node.variables.used, 'use'));
  if (!node.variables.created.length && !node.variables.used.length) {
    panel.append(para('No variables created or used by this state.', 'placeholder'));
  }
  return panel;
}

function renderChipGroup(label: string, names: string[], kind: string): HTMLElement {
  const group = el('div', 'chip-group');
  group.append(span(label, 'chip-label'));
  if (names.length === 0) {
    group.append(span('—', 'placeholder'));
    return group;
  }
  for (const name of names) {
    const chip = button(`$${name}`, `chip ${kind}`);
    if (name === selectedVariable) {
      chip.classList.add('active');
    }
    chip.addEventListener('click', () => selectVariable(name));
    group.append(chip);
  }
  return group;
}

function renderVariableList(m: ViewModel): HTMLElement {
  const list = el('ul', 'var-list');
  for (const info of m.variables) {
    const item = el('li', 'var-item') as HTMLLIElement;
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    if (info.name === selectedVariable) {
      item.classList.add('active');
      item.setAttribute('aria-pressed', 'true');
    }
    item.append(span(`$${info.name}`, 'var-name'));
    item.append(span(`${info.definitions.length} def · ${info.references.length} use`, 'var-meta'));
    item.addEventListener('click', () => selectVariable(info.name));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectVariable(info.name);
      }
    });
    list.append(item);
  }
  return list;
}

function renderVariableDetail(info: VariableInfo | undefined): HTMLElement {
  const detail = el('div', 'var-detail');
  if (!info) {
    return detail;
  }
  detail.append(heading(`$${info.name}`));
  detail.append(renderUsageList('Defined in', info.definitions, 'def'));
  detail.append(renderUsageList('Referenced in', info.references, 'ref'));
  return detail;
}

function renderUsageList(
  label: string,
  usages: VariableInfo['definitions'],
  kind: string,
): HTMLElement {
  const wrap = el('div', `usage-group ${kind}`);
  wrap.append(span(label, 'chip-label'));
  if (usages.length === 0) {
    wrap.append(span('—', 'placeholder'));
    return wrap;
  }
  const list = el('ul', 'usage-list');
  for (const u of usages) {
    const item = el('li', 'usage-item') as HTMLLIElement;
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.append(span(u.stateName, 'usage-state'));
    item.append(span(u.field, 'usage-field'));
    const reveal = () =>
      u.range
        ? post({ type: 'revealRange', start: u.range.start, end: u.range.end })
        : post({ type: 'selectState', nodeId: u.nodeId });
    item.addEventListener('click', reveal);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        reveal();
      }
    });
    list.append(item);
  }
  wrap.append(list);
  return wrap;
}

function renderDiagnostics(m: ViewModel): HTMLElement {
  const diags = el('div', 'diagnostics');
  diags.append(heading('Diagnostics'));
  for (const d of m.diagnostics) {
    diags.append(para(`${d.severity.toUpperCase()}: ${d.message}`, `diag ${d.severity}`));
  }
  return diags;
}

// --- tiny DOM helpers ---
function el(tag: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  return node;
}
function span(text: string, className?: string): HTMLElement {
  const node = el('span', className);
  node.textContent = text;
  return node;
}
function para(text: string, className?: string): HTMLElement {
  const node = el('p', className);
  node.textContent = text;
  return node;
}
function heading(text: string): HTMLElement {
  const node = el('h2');
  node.textContent = text;
  return node;
}
function strong(text: string): HTMLElement {
  const node = el('strong');
  node.textContent = text;
  return node;
}
function badge(text: string): HTMLElement {
  return span(text, 'badge');
}
function button(text: string, className?: string): HTMLButtonElement {
  const node = el('button', className) as HTMLButtonElement;
  node.type = 'button';
  node.textContent = text;
  return node;
}
function iconButton(text: string, title: string, onClick: () => void): HTMLButtonElement {
  const node = button(text, 'icon-btn');
  node.title = title;
  node.setAttribute('aria-label', title);
  node.addEventListener('click', onClick);
  return node;
}

window.addEventListener('message', (event: MessageEvent<ExtensionToWebview>) => {
  const message = event.data;
  if (message.type === 'loadModel') {
    model = message.model;
    options = message.options;
    if (selectedNodeId && !model.nodes.some((n) => n.id === selectedNodeId)) {
      selectedNodeId = undefined;
    }
    if (selectedVariable && !model.variables.some((v) => v.name === selectedVariable)) {
      selectedVariable = undefined;
    }
    render();
  } else if (message.type === 'error') {
    root.replaceChildren();
    root.append(para(message.message, 'placeholder'));
  }
});

post({ type: 'ready' });
