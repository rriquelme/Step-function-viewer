# Contributing

Thanks for your interest in improving the Step Function Viewer Light!

## Prerequisites

- Node.js 20 (see `.nvmrc`)
- VS Code

## Setup

```bash
npm install
npm run watch   # rebuilds out/ on change
```

Press <kbd>F5</kbd> to launch the Extension Development Host, then open one of
the files in `examples/` with the **Step Function Viewer Light** editor.

## Checks

Run these before opening a PR (CI runs the same):

```bash
npm run lint
npm run typecheck
npm test                 # unit tests (vitest)
npm run build
npm run test:integration # VS Code integration tests (downloads VS Code)
```

## Project layout

| Path | Purpose |
| --- | --- |
| `src/asl/` | vscode-free ASL parsing, graph model, validation, query-language detection |
| `src/analysis/` | JSONata variable data-flow analysis |
| `src/model/` | the serializable view model handed to the webview |
| `src/shared/` | typed extension↔webview message protocol |
| `src/editor/` | the custom editor provider, diagnostics |
| `src/webview/` | webview UI; `webview/graph/` holds layout, render, and viewport |
| `test/unit/` | vitest unit tests (pure logic, plus jsdom render tests) |
| `test/integration/` | `@vscode/test-cli` integration tests |

See [`docs/architecture.md`](docs/architecture.md) for a deeper tour.

## Conventions

- TypeScript strict mode; keep the `src/asl` and `src/analysis` modules free of
  `vscode` imports so they stay unit-testable.
- Prefer small, pure functions with unit tests for parsing/analysis/layout.
- Match the existing code style (Prettier + ESLint enforce it).
