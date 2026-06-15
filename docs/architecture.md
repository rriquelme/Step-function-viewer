# Architecture

The extension is split into a **pure analysis core** (no `vscode` dependency,
fully unit-testable) and a thin **VS Code integration + webview UI** around it.

## Data flow

```
ASL document (JSON or YAML)
      │
      ▼
parseDocument  (src/asl/document.ts)            machine object + rangeAt resolver
   (JSON: jsonc-parser, YAML: yaml)              (position-aware, format-agnostic)
      │
      ├─► buildGraph     (src/asl/graph.ts)     nodes + typed edges, nested scopes flattened
      ├─► validate       (src/asl/validate.ts)  structural diagnostics
      └─► analyzeVariables (src/analysis/...)    definitions / references / per-state summary
      │
      ▼
buildViewModel  (src/model/viewModel.ts)        one serializable ViewModel
      │
      │  postMessage({ type: 'loadModel', model, options })
      ▼
Webview (src/webview/main.ts)
      ├─► layoutGraph  (graph/layout.ts)   dagre → positioned nodes + routed edges
      ├─► renderInto   (graph/render.ts)   SVG nodes + edges
      ├─► Viewport     (graph/viewport.ts) pan / zoom / fit
      └─► sidebar      variable list + per-state menu + detail
```

## Key design choices

- **Scope-qualified node ids.** Nested states get ids like `P/b0/Inner` and
  `M/item/Step` so Parallel branches and Map item processors live in one flat
  graph while remaining unambiguous. `buildGraph` emits `branch` / `map` edges
  from a container to its children's `StartAt`.

- **Layout is separate from rendering.** `layoutGraph` is a pure function
  (dagre, no DOM). Rendering and highlighting never re-run layout; a
  `structureHash` lets the webview reuse the previous layout when only
  expressions changed, preserving the user's zoom/pan.

- **No real cluster nesting.** The bundled dagre version throws when an edge
  attaches to a compound/cluster parent — which our container states always have
  (incoming `Next`, outgoing `branch`/`map`). Containers are therefore rendered
  as ordinary (distinctly styled) nodes, with `branch`/`map` edges conveying the
  nesting. Native clustering would require switching to elkjs.

- **Variable analysis is a focused scanner, not a full JSONata parser.** It
  reads `{% %}` blocks, treats `Assign` keys as definitions and `$name` tokens
  as references, and excludes function calls (`$map(...)`), reserved context
  (`$states`, `$$`), expression-local bindings (`$x := ...`), and string
  literals. See `src/asl/jsonata.ts`.

- **Format-agnostic positions.** JSON and YAML are unified behind
  `parseDocument`, which returns the plain `machine` object plus a `rangeAt(path)`
  resolver. `buildGraph`, `validateStateMachine`, and `analyzeVariables` take
  `rangeAt` rather than a format-specific syntax tree, so click-to-source works
  identically for both formats and adding a new format is localized to
  `document.ts`.

## Messaging

All extension↔webview messages are typed in `src/shared/protocol.ts`:

- Extension → webview: `loadModel` (model + view options), `error`.
- Webview → extension: `ready`, `selectState` (reveal in source),
  `selectVariable`.
