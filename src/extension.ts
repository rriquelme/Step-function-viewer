import * as vscode from 'vscode';
import { detectFormat, looksLikeStateMachine } from './asl/document';
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
  context.subscriptions.push(registerViewerSuggestion(context));
}

export function deactivate(): void {
  // Nothing to clean up; disposables are registered on the context.
}

/**
 * When a JSON/YAML file that looks like a state machine becomes active, suggest
 * opening it in the viewer (once per file per session). "Always" turns on the
 * `stepFunctionViewer.autoOpen` setting; "Don't Show Again" persists globally.
 */
function registerViewerSuggestion(context: vscode.ExtensionContext): vscode.Disposable {
  const DISMISS_KEY = 'stepFunctionViewer.suggestionDismissed';
  const suggestedThisSession = new Set<string>();

  const maybeSuggest = async (editor: vscode.TextEditor | undefined): Promise<void> => {
    if (!editor || context.globalState.get<boolean>(DISMISS_KEY)) {
      return;
    }
    const config = vscode.workspace.getConfiguration('stepFunctionViewer');
    if (config.get<boolean>('autoOpen')) {
      return; // autoOpen already switches to the viewer; no need to ask.
    }
    const document = editor.document;
    if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled') {
      return;
    }
    const uri = document.uri.toString();
    if (suggestedThisSession.has(uri) || !isAslTextDocument(document)) {
      return;
    }
    suggestedThisSession.add(uri);

    const open = 'Open Viewer';
    const always = 'Always Open Automatically';
    const never = "Don't Show Again";
    const choice = await vscode.window.showInformationMessage(
      'This file looks like a Step Functions state machine. View it as a graph?',
      open,
      always,
      never,
    );
    if (choice === open || choice === always) {
      if (choice === always) {
        await config.update('autoOpen', true, vscode.ConfigurationTarget.Global);
      }
      await vscode.commands.executeCommand(
        'vscode.openWith',
        document.uri,
        StepFunctionEditorProvider.viewType,
      );
    } else if (choice === never) {
      await context.globalState.update(DISMISS_KEY, true);
    }
  };

  // Cover both the editor already open at activation and later activations.
  void maybeSuggest(vscode.window.activeTextEditor);
  return vscode.window.onDidChangeActiveTextEditor((editor) => void maybeSuggest(editor));
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
  if (/\.asl(\.json|\.ya?ml)?$/.test(document.fileName)) {
    return true;
  }
  const format = detectFormat(document.fileName);
  const lang = format === 'yaml' ? 'yaml' : 'json';
  return document.languageId === lang && looksLikeStateMachine(document.getText(), format);
}
