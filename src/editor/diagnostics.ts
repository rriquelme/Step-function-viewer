import * as vscode from 'vscode';
import { looksLikeStateMachine } from '../asl/parser';
import { buildViewModel } from '../model/viewModel';

/**
 * Publishes structural diagnostics for ASL documents to the Problems panel,
 * keeping them in sync as documents open and change.
 */
export function registerDiagnostics(): vscode.Disposable {
  const collection = vscode.languages.createDiagnosticCollection('stepFunctionViewer');

  const refresh = (document: vscode.TextDocument): void => {
    if (!isAslDocument(document)) {
      collection.delete(document.uri);
      return;
    }
    const model = buildViewModel(document.getText());
    const diagnostics = model.diagnostics.map((d) => {
      const range = d.range
        ? new vscode.Range(
            document.positionAt(d.range.start),
            document.positionAt(d.range.end),
          )
        : new vscode.Range(0, 0, 0, 0);
      const severity =
        d.severity === 'error'
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning;
      const diag = new vscode.Diagnostic(range, d.message, severity);
      diag.source = 'Step Function Viewer';
      return diag;
    });
    collection.set(document.uri, diagnostics);
  };

  let debounce: ReturnType<typeof setTimeout> | undefined;
  const disposables = [
    collection,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (debounce) {
        clearTimeout(debounce);
      }
      debounce = setTimeout(() => refresh(e.document), 200);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri)),
  ];

  // Diagnose already-open documents.
  for (const document of vscode.workspace.textDocuments) {
    refresh(document);
  }

  return vscode.Disposable.from(...disposables);
}

function isAslDocument(document: vscode.TextDocument): boolean {
  if (/\.asl(\.json)?$/.test(document.fileName)) {
    return true;
  }
  return document.languageId === 'json' && looksLikeStateMachine(document.getText());
}
