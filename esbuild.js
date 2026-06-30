// Build script for the Step Function Viewer Light extension.
// Produces two bundles:
//   out/extension.js  -> extension host code (Node, `vscode` external)
//   out/webview.js     -> webview UI code (browser), plus out/webview.css
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  ...common,
  entryPoints: ['src/extension.ts'],
  outfile: 'out/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  // Prefer ESM builds of dependencies. jsonc-parser's UMD build uses an
  // AMD-style dynamic require('./impl/format') that esbuild cannot statically
  // inline, which breaks the bundle at runtime; its ESM build bundles cleanly.
  mainFields: ['module', 'main'],
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  ...common,
  entryPoints: ['src/webview/main.ts'],
  outfile: 'out/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  loader: { '.css': 'css' },
};

async function main() {
  const contexts = await Promise.all([
    esbuild.context(extensionConfig),
    esbuild.context(webviewConfig),
  ]);

  if (watch) {
    await Promise.all(contexts.map((c) => c.watch()));
    console.log('[esbuild] watching...');
  } else {
    await Promise.all(contexts.map((c) => c.rebuild()));
    await Promise.all(contexts.map((c) => c.dispose()));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
