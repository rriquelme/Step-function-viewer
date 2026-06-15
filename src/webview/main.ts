// Webview entry point. For Phase 1/2 this renders a structured, interactive
// list of the parsed state machine (states, nesting, query language,
// diagnostics) and wires click-to-source. The SVG graph arrives in Phase 4.
import './style.css';
import type { ExtensionToWebview, WebviewToExtension } from '../shared/protocol';
import type { ViewModel, ViewNode } from '../model/viewModel';

interface VsCodeApi {
  postMessage(message: WebviewToExtension): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const root = document.getElementById('app')!;

function post(message: WebviewToExtension): void {
  vscode.postMessage(message);
}

function depthOf(node: ViewNode): number {
  // Nesting depth derived from the scope-qualified id ("P/b0/Inner").
  return Math.max(0, node.id.split('/').length - 1);
}

function render(model: ViewModel): void {
  root.innerHTML = '';

  const toolbar = el('div', 'toolbar');
  toolbar.append(strong(`Step Function Viewer`));
  toolbar.append(badge(`Query: ${model.queryLanguage}`));
  if (model.startAt) {
    toolbar.append(badge(`StartAt: ${model.startAt}`));
  }
  toolbar.append(badge(`${model.nodes.length} states`));
  root.append(toolbar);

  const content = el('div', 'content');

  if (!model.ok) {
    content.append(para('This document is not a valid Amazon States Language state machine.', 'placeholder'));
    root.append(content);
    return;
  }

  content.append(para('Interactive graph rendering arrives in Phase 4. Click a state to reveal it in the source.', 'placeholder'));

  const list = el('ul', 'state-list');
  for (const node of model.nodes) {
    const item = el('li', 'state-item') as HTMLLIElement;
    item.style.marginLeft = `${depthOf(node) * 18}px`;
    item.append(span(node.type, 'type'));
    item.append(span(node.name, 'name'));
    if (node.container) {
      item.append(span('contains sub-states', 'nested'));
    }
    item.addEventListener('click', () => post({ type: 'selectState', nodeId: node.id }));
    list.append(item);
  }
  content.append(list);

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

window.addEventListener('message', (event: MessageEvent<ExtensionToWebview>) => {
  const message = event.data;
  if (message.type === 'loadModel') {
    render(message.model);
  } else if (message.type === 'error') {
    root.innerHTML = '';
    root.append(para(message.message, 'placeholder'));
  }
});

post({ type: 'ready' });
