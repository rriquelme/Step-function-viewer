import * as vscode from 'vscode';
import { detectFormat } from '../asl/document';
import { buildViewModel } from '../model/viewModel';
import type { ExtensionToWebview, WebviewToExtension } from '../shared/protocol';

/**
 * Custom text editor that renders an ASL state machine in a webview and keeps
 * it in sync with the underlying document.
 */
export class StepFunctionEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'stepFunctionViewer.editor';

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new StepFunctionEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      StepFunctionEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    );
  }

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): void {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'out')],
    };
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    const post = (message: ExtensionToWebview) => {
      void webviewPanel.webview.postMessage(message);
    };

    const updateWebview = () => {
      try {
        const model = buildViewModel(document.getText(), detectFormat(document.fileName));
        const layoutDirection =
          vscode.workspace
            .getConfiguration('stepFunctionViewer')
            .get<'TB' | 'LR'>('layoutDirection') ?? 'TB';
        post({ type: 'loadModel', model, options: { layoutDirection } });
      } catch (err) {
        post({ type: 'error', message: `Failed to parse state machine: ${String(err)}` });
      }
    };

    // Debounce document edits to avoid re-parsing on every keystroke.
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      if (debounce) {
        clearTimeout(debounce);
      }
      debounce = setTimeout(updateWebview, 150);
    });

    const messageSub = webviewPanel.webview.onDidReceiveMessage(
      (message: WebviewToExtension) => {
        switch (message.type) {
          case 'ready':
            updateWebview();
            break;
          case 'selectState':
            void this.revealState(document, message.nodeId);
            break;
          case 'revealRange':
            void this.revealRange(document, message.start, message.end);
            break;
          case 'selectVariable':
            // Highlighting happens entirely in the webview.
            break;
        }
      },
    );

    const configSub = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('stepFunctionViewer.layoutDirection')) {
        updateWebview();
      }
    });

    webviewPanel.onDidDispose(() => {
      if (debounce) {
        clearTimeout(debounce);
      }
      changeSub.dispose();
      messageSub.dispose();
      configSub.dispose();
    });
  }

  /** Reveal the source range of a state in a text editor (click-to-source). */
  private async revealState(document: vscode.TextDocument, nodeId: string): Promise<void> {
    const model = buildViewModel(document.getText(), detectFormat(document.fileName));
    const node = model.nodes.find((n) => n.id === nodeId);
    if (!node?.range) {
      return;
    }
    const range = new vscode.Range(
      document.positionAt(node.range.start),
      document.positionAt(node.range.end),
    );
    await this.reveal(document, range);
  }

  /** Reveal an exact character-offset range (used for a specific variable usage). */
  private async revealRange(
    document: vscode.TextDocument,
    start: number,
    end: number,
  ): Promise<void> {
    await this.reveal(
      document,
      new vscode.Range(document.positionAt(start), document.positionAt(end)),
    );
  }

  private async reveal(document: vscode.TextDocument, range: vscode.Range): Promise<void> {
    const editor = await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: false,
    });
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview.css'),
    );
    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Step Function Viewer</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
