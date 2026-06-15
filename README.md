# Step Function Viewer

A VS Code extension that renders AWS Step Functions (Amazon States Language,
**JSONata** query language) as an interactive view. Its differentiator: clicking
a state will list every **variable** created or used by that state, and clicking
a variable will **highlight every other state** where it is assigned or
referenced — a data-flow lens over your state machine.

> Status: early development. See [`plans/01-project-plan.md`](plans/01-project-plan.md)
> for the full roadmap. Phases 0–4 are implemented (interactive graph + variable
> inspector); packaging/docs (Phases 6–7) are next.

## Features (current)

- Custom editor for `*.asl.json` / `*.asl` files with an **interactive SVG
  graph** (dagre layout, pan / zoom / fit, per-state-type nodes, labeled edges
  for Choice / Default / Catch, and `branch` / `map` edges into nested states).
- **Variable inspector (the differentiator):** click a state to see the
  variables it *creates* and *uses*; click a variable to **highlight every
  state** that defines it (green) or references it (blue) and dim the rest.
- Parses nested **Parallel** branches and **Map** item processors.
- Detects the effective **QueryLanguage** (JSONata vs JSONPath).
- Structural diagnostics in the Problems panel: missing `StartAt`, dangling
  transitions, unreachable states, states with neither `Next` nor `End`.
- Click-to-source: reveal any state's JSON in the document (node double-click or
  the sidebar "source" button).

## Getting started (development)

```bash
npm install
npm run build      # bundle extension + webview into out/
npm run watch      # rebuild on change (used by F5)
npm test           # unit tests (vitest)
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

Press <kbd>F5</kbd> in VS Code to launch the Extension Development Host, then
open `examples/order-processing.asl.json` with the **Step Function Viewer**
editor (right-click → *Open With…*, or run the *Open Step Function Viewer*
command).

## Architecture

- `src/asl/` — vscode-free ASL parsing (`parser.ts`), graph model (`graph.ts`),
  validation (`validate.ts`), and query-language resolution. Unit-tested.
- `src/model/viewModel.ts` — the serializable model handed to the webview.
- `src/shared/protocol.ts` — typed messages between extension host and webview.
- `src/editor/` — the `CustomTextEditorProvider` and webview HTML/CSP.
- `src/webview/` — the webview UI (placeholder list today; SVG graph in Phase 4).

## License

MIT — see [LICENSE](LICENSE).
