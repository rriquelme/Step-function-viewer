import * as vscode from 'vscode';
import { StepFunctionEditorProvider } from './editor/stepFunctionEditorProvider';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(StepFunctionEditorProvider.register(context));

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
}

export function deactivate(): void {
  // Nothing to clean up; disposables are registered on the context.
}
