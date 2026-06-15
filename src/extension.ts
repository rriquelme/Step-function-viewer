import * as vscode from 'vscode';
import { looksLikeStateMachine } from './asl/parser';
import { registerDiagnostics } from './editor/diagnostics';
import { StepFunctionEditorProvider } from './editor/stepFunctionEditorProvider';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(StepFunctionEditorProvider.register(context));
  context.subscriptions.push(registerDiagnostics());

  context.subscriptions.push(
    vscode.commands.registerCommand('stepFunctionViewer.open', async () => {
      const uri = vscode.window.activeTextEditor?.document.uri;
      if (!uri) {
        void vscode.window.showInformationMessage(
          'Open an Amazon States Language (ASL) file first.',
        );
        return;
      }
      await vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        StepFunctionEditorProvider.viewType,
      );
    }),
  );

  context.subscriptions.push(registerAutoOpen());
}

export function deactivate(): void {
  // Nothing to clean up; disposables are registered on the context.
}

/**
 * When `stepFunctionViewer.autoOpen` is enabled, switch newly-activated ASL
 * text editors over to the Step Function Viewer custom editor.
 */
function registerAutoOpen(): vscode.Disposable {
  const handledThisSession = new Set<string>();

  return vscode.window.onDidChangeActiveTextEditor(async (editor) => {
    if (!editor) {
      return;
    }
    const config = vscode.workspace.getConfiguration('stepFunctionViewer');
    if (!config.get<boolean>('autoOpen')) {
      return;
    }
    const document = editor.document;
    const uri = document.uri.toString();
    if (handledThisSession.has(uri) || !isAslTextDocument(document)) {
      return;
    }
    handledThisSession.add(uri);
    await vscode.commands.executeCommand(
      'vscode.openWith',
      document.uri,
      StepFunctionEditorProvider.viewType,
    );
  });
}

function isAslTextDocument(document: vscode.TextDocument): boolean {
  if (/\.asl(\.json)?$/.test(document.fileName)) {
    return true;
  }
  return document.languageId === 'json' && looksLikeStateMachine(document.getText());
}
