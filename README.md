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

- Custom editor for `*.asl.json` / `*.asl` and `*.asl.yaml` / `*.asl.yml` files
  with an **interactive SVG graph** (dagre layout, pan / zoom / fit,
  per-state-type nodes, labeled edges for Choice / Default / Catch, and
  `branch` / `map` edges into nested states). Click-to-source works for both
  JSON and YAML.
- **Variable inspector (the differentiator):** click a state to see the
  variables it *creates* and *uses*; click a variable to **highlight every
  state** that defines it (green) or references it (blue) and dim the rest.
- Parses nested **Parallel** branches and **Map** item processors.
- Detects the effective **QueryLanguage** (JSONata vs JSONPath).
- Structural diagnostics in the Problems panel: missing `StartAt`, dangling
  transitions, unreachable states, states with neither `Next` nor `End`.
- Click-to-source: reveal any state's JSON in the document (node double-click or
  the sidebar "source" button).

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `stepFunctionViewer.layoutDirection` | `TB` | Graph layout direction: top-to-bottom (`TB`) or left-to-right (`LR`). |
| `stepFunctionViewer.autoOpen` | `false` | Automatically open the viewer when an ASL file is activated. |

## Supported ASL

- State types: `Task`, `Choice`, `Parallel`, `Map`, `Pass`, `Wait`, `Succeed`,
  `Fail`.
- Transitions: `Next`, `End`, Choice `Choices`/`Default`, `Catch`, and entry
  into `Parallel` branches and `Map` item processors (`ItemProcessor` /
  `Iterator`).
- Query language: **JSONata** is the target for variable analysis. JSONPath
  machines render but report no user variables.
- File formats: **JSON** (`*.asl.json`, `*.asl`) and **YAML** (`*.asl.yaml`,
  `*.asl.yml`), e.g. a state machine exported as YAML from Workflow Studio.

## Examples

The [`examples/`](examples/) folder contains state machines for trying the
viewer:

- `order-processing.asl.json` — Parallel + Map + Choice with shared variables.
- `order-processing.asl.yaml` — the same workflow in YAML.
- `retry-catch.asl.json` — Retry/Catch with variables assigned on the error path.
- `choice-routing.asl.json` — Choice routing driven by assigned variables.
- `diagnostics-demo.asl.json` — dangling transition + unreachable state.
- `jsonpath-legacy.asl.json` — a JSONPath machine (renders, no variables).

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
