import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out-test/test/integration/**/*.test.js',
  version: 'stable',
  // The integration tests use the BDD interface (describe/it) and poll for
  // diagnostics, so raise Mocha's default 2s timeout.
  mocha: {
    ui: 'bdd',
    timeout: 20000,
  },
});
