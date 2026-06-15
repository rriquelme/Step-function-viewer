// Typed message protocol shared by the extension host and the webview.
import type { ViewModel } from '../model/viewModel';

/** View options derived from extension settings. */
export interface ViewOptions {
  layoutDirection: 'TB' | 'LR';
}

/** Messages sent from the extension host to the webview. */
export type ExtensionToWebview =
  | { type: 'loadModel'; model: ViewModel; options: ViewOptions }
  | { type: 'error'; message: string };

/** Messages sent from the webview to the extension host. */
export type WebviewToExtension =
  | { type: 'ready' }
  | { type: 'selectState'; nodeId: string }
  | { type: 'selectVariable'; variable: string };
