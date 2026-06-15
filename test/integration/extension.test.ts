import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

const EXAMPLES = path.resolve(__dirname, '../../../examples');

async function waitFor<T>(
  produce: () => T,
  predicate: (value: T) => boolean,
  timeoutMs = 5000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = produce();
    if (predicate(value)) {
      return value;
    }
    if (Date.now() - start > timeoutMs) {
      return value;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('Step Function Viewer extension', () => {
  before(async () => {
    // The extension activates lazily (custom editor / command). Force activation
    // so the diagnostics listener is registered before we open documents.
    const ext = vscode.extensions.getExtension('step-function-viewer.step-function-viewer');
    await ext?.activate();
  });

  it('registers the open command', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('stepFunctionViewer.open'),
      'expected stepFunctionViewer.open to be registered',
    );
  });

  it('contributes the custom editor', () => {
    const ext = vscode.extensions.getExtension('step-function-viewer.step-function-viewer');
    assert.ok(ext, 'extension should be discoverable');
    const editors = ext!.packageJSON.contributes.customEditors;
    assert.ok(
      editors.some((e: { viewType: string }) => e.viewType === 'stepFunctionViewer.editor'),
      'custom editor should be contributed',
    );
  });

  it('publishes diagnostics for a flawed ASL document', async () => {
    const doc = await vscode.workspace.openTextDocument(
      path.join(EXAMPLES, 'diagnostics-demo.asl.json'),
    );
    const diags = await waitFor(
      () => vscode.languages.getDiagnostics(doc.uri),
      (d) => d.length > 0,
    );
    assert.ok(
      diags.some((d) => /unknown state/.test(d.message)),
      'expected a dangling-transition diagnostic',
    );
    assert.ok(
      diags.some((d) => /unreachable/.test(d.message)),
      'expected an unreachable-state diagnostic',
    );
  });

  it('opens the custom viewer for a valid example without throwing', async () => {
    const doc = await vscode.workspace.openTextDocument(
      path.join(EXAMPLES, 'order-processing.asl.json'),
    );
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('stepFunctionViewer.open');
  });
});
