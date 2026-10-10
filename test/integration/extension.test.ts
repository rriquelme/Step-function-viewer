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
    const ext = vscode.extensions.getExtension('RobertoRiquelmeSaez.step-function-viewer-light');
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
    const ext = vscode.extensions.getExtension('RobertoRiquelmeSaez.step-function-viewer-light');
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

  it('opens *.asl.json in the viewer by default and plain JSON as text', async () => {
    const activeViewType = () => {
      const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
      return input instanceof vscode.TabInputCustom ? input.viewType : undefined;
    };

    // The previous test left the viewer open; start from a clean slate.
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

    await vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.file(path.join(EXAMPLES, 'order-processing.asl.json')),
    );
    assert.strictEqual(
      await waitFor(activeViewType, (v) => v !== undefined),
      'stepFunctionViewer.editor',
    );

    await vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.file(path.resolve(EXAMPLES, '../package.json')),
    );
    const input = await waitFor(
      () => vscode.window.tabGroups.activeTabGroup.activeTab?.input,
      (i) => i instanceof vscode.TabInputText,
    );
    assert.ok(input instanceof vscode.TabInputText, 'plain JSON should open as text');
  });
});
