// Webview entry point.
//
// Until the SVG graph lands (Phase 4) this renders an interactive list view that
// already delivers the core differentiator (Phases 3 & 5):
//   - click a state to see the variables it CREATES and USES,
//   - click a variable to HIGHLIGHT every state that defines or references it.
import './style.css';
import type { ExtensionToWebview, WebviewToExtension } from '../shared/protocol';
import type { ViewModel, ViewNode } from '../model/viewModel';
import type { VariableInfo } from '../analysis/variables';

interface VsCodeApi {
  postMessage(message: WebviewToExtension): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const root = document.getElementById('app')!;

let model: ViewModel | undefined;
let selectedNodeId: string | undefined;
let selectedVariable: string | undefined;

function post(message: WebviewToExtension): void {
  vscode.postMessage(message);
}

function depthOf(node: ViewNode): number {
  return Math.max(0, node.id.split('/').length - 1);
}

function selectVariable(name: string | undefined): void {
  selectedVariable = selectedVariable === name ? undefined : name;
  if (selectedVariable) {
    post({ type: 'selectVariable', variable: selectedVariable });
  }
  render();
}

function selectState(nodeId: string): void {
  selectedNodeId = selectedNodeId === nodeId ? undefined : nodeId;
  render();
}

function highlightFor(name: string | undefined): { defs: Set<string>; refs: Set<string> } {
  const defs = new Set<string>();
  const refs = new Set<string>();
  if (!name || !model) {
    return { defs, refs };
  }
  const info = model.variables.find((v) => v.name === name);
  if (info) {
    info.definitions.forEach((u) => defs.add(u.nodeId));
    info.references.forEach((u) => refs.add(u.nodeId));
  }
  return { defs, refs };
}

function render(): void {
  root.innerHTML = '';
  if (!model) {
    return;
  }

  root.append(renderToolbar(model));

  const content = el('div', 'content');
  if (!model.ok) {
    content.append(
      para('This document is not a valid Amazon States Language state machine.', 'placeholder'),
    );
    root.append(content);
    return;
  }

  const layout = el('div', 'layout');
  layout.append(renderStateColumn(model));
  layout.append(renderSidebar(model));
  content.append(layout);

  if (model.diagnostics.length > 0) {
    const diags = el('div', 'diagnostics');
    diags.append(heading('Diagnostics'));
    for (const d of model.diagnostics) {
      diags.append(para(`${d.severity.toUpperCase()}: ${d.message}`, `diag ${d.severity}`));
    }
    content.append(diags);
  }

  root.append(content);
}

function renderToolbar(m: ViewModel): HTMLElement {
  const toolbar = el('div', 'toolbar');
  toolbar.append(strong('Step Function Viewer'));
  toolbar.append(badge(`Query: ${m.queryLanguage}`));
  if (m.startAt) {
    toolbar.append(badge(`StartAt: ${m.startAt}`));
  }
  toolbar.append(badge(`${m.nodes.length} states`));
  toolbar.append(badge(`${m.variables.length} variables`));
  if (selectedVariable) {
    const clear = button(`Clear highlight: $${selectedVariable} ✕`, 'clear-btn');
    clear.addEventListener('click', () => selectVariable(undefined));
    toolbar.append(clear);
  }
  return toolbar;
}

function renderStateColumn(m: ViewModel): HTMLElement {
  const { defs, refs } = highlightFor(selectedVariable);
  const column = el('div', 'states-column');
  column.append(
    para('Click a state to inspect its variables. Click a variable to highlight its uses.', 'placeholder'),
  );

  const list = el('ul', 'state-list');
  for (const node of m.nodes) {
    const item = el('li', 'state-item') as HTMLLIElement;
    item.style.marginLeft = `${depthOf(node) * 18}px`;
    if (selectedVariable) {
      if (defs.has(node.id)) {
        item.classList.add('def');
      } else if (refs.has(node.id)) {
        item.classList.add('ref');
      } else {
        item.classList.add('dimmed');
      }
    }
    if (node.id === selectedNodeId) {
      item.classList.add('selected');
    }

    const header = el('div', 'state-header');
    header.append(span(node.type, 'type'));
    header.append(span(node.name, 'name'));
    if (node.variables.created.length || node.variables.used.length) {
      header.append(
        span(`${node.variables.created.length}↑ ${node.variables.used.length}↓`, 'var-counts'),
      );
    }
    const src = button('source ⤴', 'src-btn');
    src.addEventListener('click', (e) => {
      e.stopPropagation();
      post({ type: 'selectState', nodeId: node.id });
    });
    header.append(src);
    header.addEventListener('click', () => selectState(node.id));
    item.append(header);

    if (node.id === selectedNodeId) {
      item.append(renderVariableMenu(node));
    }
    list.append(item);
  }
  column.append(list);
  return column;
}

function renderVariableMenu(node: ViewNode): HTMLElement {
  const menu = el('div', 'var-menu');
  menu.append(renderChipGroup('Creates', node.variables.created, 'create'));
  menu.append(renderChipGroup('Uses', node.variables.used, 'use'));
  if (!node.variables.created.length && !node.variables.used.length) {
    menu.append(para('No variables created or used by this state.', 'placeholder'));
  }
  return menu;
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
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      selectVariable(name);
    });
    group.append(chip);
  }
  return group;
}

function renderSidebar(m: ViewModel): HTMLElement {
  const sidebar = el('div', 'sidebar');
  sidebar.append(heading('Variables'));
  if (m.variables.length === 0) {
    sidebar.append(para('No user variables found.', 'placeholder'));
    return sidebar;
  }
  const list = el('ul', 'var-list');
  for (const info of m.variables) {
    const item = el('li', 'var-item') as HTMLLIElement;
    if (info.name === selectedVariable) {
      item.classList.add('active');
    }
    item.append(span(`$${info.name}`, 'var-name'));
    item.append(span(`${info.definitions.length} def · ${info.references.length} use`, 'var-meta'));
    item.addEventListener('click', () => selectVariable(info.name));
    list.append(item);
  }
  sidebar.append(list);

  if (selectedVariable) {
    sidebar.append(renderVariableDetail(m.variables.find((v) => v.name === selectedVariable)));
  }
  return sidebar;
}

function renderVariableDetail(info: VariableInfo | undefined): HTMLElement {
  const detail = el('div', 'var-detail');
  if (!info) {
    return detail;
  }
  detail.append(heading(`$${info.name}`));
  detail.append(renderUsageList('Defined in', info.definitions));
  detail.append(renderUsageList('Referenced in', info.references));
  return detail;
}

function renderUsageList(
  label: string,
  usages: VariableInfo['definitions'],
): HTMLElement {
  const wrap = el('div', 'usage-group');
  wrap.append(span(label, 'chip-label'));
  if (usages.length === 0) {
    wrap.append(span('—', 'placeholder'));
    return wrap;
  }
  const list = el('ul', 'usage-list');
  for (const u of usages) {
    const item = el('li', 'usage-item') as HTMLLIElement;
    item.append(span(u.stateName, 'usage-state'));
    item.append(span(u.field, 'usage-field'));
    item.addEventListener('click', () => post({ type: 'selectState', nodeId: u.nodeId }));
    list.append(item);
  }
  wrap.append(list);
  return wrap;
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

window.addEventListener('message', (event: MessageEvent<ExtensionToWebview>) => {
  const message = event.data;
  if (message.type === 'loadModel') {
    model = message.model;
    // Drop selections that no longer exist after an edit.
    if (selectedNodeId && !model.nodes.some((n) => n.id === selectedNodeId)) {
      selectedNodeId = undefined;
    }
    if (selectedVariable && !model.variables.some((v) => v.name === selectedVariable)) {
      selectedVariable = undefined;
    }
    render();
  } else if (message.type === 'error') {
    root.innerHTML = '';
    root.append(para(message.message, 'placeholder'));
  }
});

post({ type: 'ready' });
