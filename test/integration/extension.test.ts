import * as assert from 'assert';
import * as vscode from 'vscode';

describe('Step Function Viewer extension', () => {
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
});
