# Step Function Viewer — VS Code Extension: Project Plan

> **Goal:** A VS Code extension that renders AWS Step Functions (Amazon States
> Language, **JSONata** query language) as an interactive graph. Its
> differentiator: clicking a state opens a panel listing every **variable**
> created or consumed by that state, and clicking a variable **highlights every
> other state** in the graph where that variable is assigned or referenced.

## Project Concept & Definitions

- **Input:** Amazon States Language (ASL) JSON documents that use
  `"QueryLanguage": "JSONata"` (state-machine level or per-state).
- **Variables:** State Functions "Variables" feature. Variables are *created*
  via a state's `Assign` block and *referenced* inside JSONata expressions
  (`{% ... %}`) using `$variableName`. Reserved context references such as
  `$states.input`, `$states.result`, `$states.errorOutput` are tracked
  separately from user variables.
- **The viewer:** A custom editor / webview that draws the state machine graph
  (states as nodes, transitions as edges) with pan/zoom.
- **The differentiator:** Per-state variable inspector + cross-state variable
  highlighting (data-flow lens), which common viewers (AWS Toolkit, Workflow
  Studio) do not provide.

---

> **Progress (2026-06-15):** Phases 0–7 substantially complete. The extension
> ships a custom editor with an **interactive SVG graph** (dagre layout,
> pan/zoom/fit, per-type nodes, labeled per-kind edges), the **variable
> inspector** differentiator (click a state → its created/used variables; click
> a variable → highlight defining/referencing states), Problems-panel
> diagnostics, click-to-source, and settings. A sample library, docs
> (`README`, `CONTRIBUTING`, `docs/architecture.md`, `CHANGELOG`), a generated
> icon, integration tests, and CI/release workflows are in place; `vsce package`
> produces a ~108 KB `.vsix`. Green: typecheck, lint, **27 unit tests**
> (incl. jsdom render tests), build, packaging. **Pending:** real Marketplace
> credentials to publish (7.3), README screenshots/GIFs (can't capture in the
> sandbox), precise per-expression source ranges (3.1), and the optional
> graph-native data-flow edges (5.4). Note: the integration tests and the
> running graph couldn't be exercised in this network-restricted sandbox (no
> VS Code download / display); they run in CI and locally.

## Phase 0 — Project Scaffolding & Tooling

- [x] **0.1 Initialize the Node/TypeScript project**
  - Create `package.json` with VS Code extension manifest fields
    (`engines.vscode`, `main`, `contributes`, `activationEvents`).
  - Add `tsconfig.json` (strict mode, `module: Node16`/`ESNext`, source maps).
  - Choose package manager (npm) and pin Node version in `.nvmrc`.
- [x] **0.2 Set up the build pipeline**
  - Use `esbuild` (fast) to bundle the extension host code and the webview
    code as two separate bundles (`out/extension.js`, `out/webview.js`).
  - Add `npm run build`, `npm run watch`, `npm run package` scripts.
- [x] **0.3 Linting, formatting, and editor config**
  - ESLint + `@typescript-eslint`, Prettier, `.editorconfig`.
  - Add `npm run lint` and a pre-commit check.
- [x] **0.4 Testing harness**
  - `@vscode/test-electron` (or `@vscode/test-cli`) for integration tests,
    plus a unit-test runner (Vitest/Jest) for pure logic (parser/analyzer).
- [x] **0.5 Repo hygiene**
  - `.gitignore` (node_modules, out, *.vsix), `.vscodeignore` (trim the
    published package), `LICENSE`, and a starter `README.md`.
  - Add `.vscode/launch.json` (Extension Development Host) and
    `.vscode/tasks.json` (watch build) for F5 debugging.
- [x] **0.6 CI**
  - GitHub Actions workflow: install, lint, typecheck, test, build `.vsix`.

---

## Phase 1 — Extension Activation & Custom Editor

- [x] **1.1 Define activation & file association**
  - Register a Custom Text Editor for `*.asl.json`, `*.asl` and a command to
    open the viewer for the currently active JSON file ("Open Step Function
    Viewer").
  - `activationEvents`: `onCustomEditor`, `onCommand`, optionally on language
    `json` when the document looks like an ASL state machine.
- [x] **1.2 Implement the `CustomTextEditorProvider`**
  - Create the webview, set CSP-safe HTML, wire `webview.options` with a
    `localResourceRoots` for bundled assets.
  - Sync document <-> webview: on document change, re-parse and post the model
    to the webview; debounce to avoid thrashing on every keystroke.
- [ ] **1.3 Commands & menus**
  - Command palette + editor title button: "Open Step Function Viewer",
    "Reveal variable usages", "Export diagram (SVG/PNG)".
  - `contributes.menus` to surface the viewer button only for ASL files.
- [x] **1.4 Settings (`contributes.configuration`)**
  - Toggle JSONPath support (future), layout direction (TB/LR), theme sync,
    auto-open viewer on ASL file open.

---

## Phase 2 — ASL Parsing & Model

- [x] **2.1 ASL type model**
  - Define TypeScript types for the State Machine and all state types:
    `Task`, `Choice`, `Parallel`, `Map`, `Pass`, `Wait`, `Succeed`, `Fail`.
  - Model `Next`, `End`, `Catch`, `Retry`, `Branches` (Parallel),
    `ItemProcessor`/`Iterator` (Map), `Default`/`Choices` (Choice).
- [x] **2.2 Robust JSON parsing**
  - Parse with a tolerant JSON parser that yields **source positions** (e.g.
    `jsonc-parser`) so we can map graph nodes back to document ranges for
    click-to-source navigation and error squiggles.
- [x] **2.3 Build the graph model**
  - Convert states + transitions into a normalized graph: nodes (with type,
    name, range) and edges (with kind: `next` | `choice` | `default` |
    `catch` | `branch-start`). Handle nested scopes (Parallel branches, Map
    item processors) as subgraphs/containers.
- [x] **2.4 Validation & diagnostics**
  - Detect: missing `StartAt`, dangling `Next` targets, unreachable states,
    states with neither `Next` nor `End`. Surface as VS Code diagnostics.
- [x] **2.5 Query-language detection**
  - Read `QueryLanguage` at machine and state level; flag JSONata vs JSONPath
    so the analyzer uses the correct extractor. Primary target: JSONata.

---

## Phase 3 — JSONata Variable Analysis (Core Differentiator)

- [ ] **3.1 Locate all JSONata expressions**
  - Scan ASL fields that accept JSONata (`{% %}`): `Assign`, `Arguments`,
    `Output`, `Items` (Map), `Condition` (Choice), `Variable` fields, etc.
  - Keep precise source ranges for each expression for later highlighting.
- [x] **3.2 Extract variable *definitions***
  - From each state's `Assign` block, record the variable names created (the
    object keys), associated with the defining state and source range.
- [x] **3.3 Extract variable *references***
  - Parse JSONata expressions (use the `jsonata` package's AST, or a focused
    tokenizer) to find `$name` references. Distinguish:
    - user variables (`$myVar`),
    - reserved context (`$states.*`, `$$` legacy context),
    - JSONata built-ins (`$map`, `$filter`, `$sum`, ...) which must be
      excluded from the variable list.
- [x] **3.4 Build the variable index**
  - Produce a map: `variableName -> { definitions: Location[], references:
    Location[] }`, where `Location = { stateName, field, range }`.
  - Track scope/shadowing where a variable is reassigned in multiple states.
- [x] **3.5 Per-state variable summary**
  - For each state compute: variables **created** (Assign), variables **used**
    (referenced in its expressions), and **passed through**. This feeds the
    click-a-state menu.
- [x] **3.6 Unit tests for the analyzer**
  - Golden-file tests over sample ASL documents covering Assign, nested Map/
    Parallel scopes, Choice conditions, and built-in exclusion.

---

## Phase 4 — Graph Rendering (Webview)

> Approach: build the graph in thin, independently working slices. Each step
> leaves the webview in a runnable state, so we can verify and commit as we go.
> Stack decision: **vanilla TS + SVG** (matches the existing webview, no
> framework) with **`@dagrejs/dagre`** for layered layout (pure JS, synchronous,
> bundles cleanly via esbuild — simpler than elkjs's worker/wasm setup).

- [x] **4.1 Add the layout dependency & layout module**
  - Add `@dagrejs/dagre` (bundled into the webview by esbuild).
  - `webview/graph/layout.ts`: pure function `layout(nodes, edges, rankdir)` →
    positioned nodes (`{id,x,y,width,height}`), edges (`{points,label,kind}`),
    and graph bounds. No DOM here, so it stays unit-testable.
  - Node sizing from the label; honor `rankdir` (`TB`/`LR`).
- [x] **4.2 Render a static SVG graph**
  - `webview/graph/render.ts`: draw nodes as `<g>` (rect + type + name) and
    edges as `<path>` with an arrowhead `<marker>`.
  - Replace the state-list column with the SVG canvas; keep the toolbar,
    sidebar, and diagnostics.
- [x] **4.3 Edge labels & per-kind styling**
  - Render Choice/Default/Catch labels at edge midpoints; style edge kinds
    (`next`, `choice`, `default`, `catch`, `branch`, `map`) via CSS classes.
  - Node styling per state type (color/accent), with a small legend.
- [x] **4.4 Pan, zoom & fit-to-screen**
  - `webview/graph/viewport.ts`: a transform controller (`translate`+`scale`)
    wrapping the root `<g>`. Wheel-zoom around the cursor, drag-to-pan,
    toolbar buttons for zoom in/out, reset, and fit-to-bounds.
- [~] **4.5 Container grouping (Parallel branches / Map item processors)**
  - Attempted dagre compound nodes (`setParent`). **Decision:** this dagre
    version throws whenever an edge attaches to a cluster-parent node, which our
    container states always do (incoming `Next`, outgoing `branch`/`map`). True
    clustering was abandoned as too fragile.
  - **Shipped instead:** a flat layout where containers are distinct nodes
    (dashed border + `▦` marker) and the `branch`/`map` entry edges keep the
    container→child nesting legible. Revisit with elkjs (native cluster support)
    if visual nesting becomes important — tracked as a stretch goal.
- [x] **4.6 Wire selection, highlighting & click-to-source into the graph**
  - Single-click a node → select it (sidebar shows its created/used variables);
    selecting a variable highlights defining (green) and referencing (blue)
    nodes and dims the rest — the differentiator, now on the graph.
  - A "reveal in source" affordance posts `selectState` (Phase 2.2 ranges).
  - Centralize the typed message protocol; pass `layoutDirection` from settings
    to the webview via the `loadModel` message options.
- [x] **4.7 Theme integration**
  - Use VS Code CSS variables throughout so the diagram matches
    light/dark/high-contrast themes.
- [x] **4.8 Performance & robustness**
  - Skip re-layout when the structure is unchanged (hash nodes/edges); guard
    against empty/invalid models; cap label sizes. (Minimap is a stretch goal.)
- [x] **4.9 Tests**
  - Unit-test `layout.ts` (deterministic positions/bounds, rankdir) and a
    structural hash helper used to skip re-layout.

---

## Phase 5 — Variable Inspector Panel (Differentiator UI)

- [x] **5.1 Per-state variable menu**
  - On clicking a state, open a panel/popover listing variables **created** and
    **used** by that state, grouped and labeled, each with its source field.
- [x] **5.2 Variable selection -> cross-state highlight**
  - Clicking a variable highlights, in the graph, every state that **defines**
    it (e.g. green outline) and every state that **references** it (e.g. blue
    outline), with a legend. Dim unrelated states to focus the data flow.
- [x] **5.3 Variable detail view**
  - Show the variable's full def/use list with jump-to-source links; allow
    cycling through usages (next/previous).
- [ ] **5.4 Data-flow edges (optional/advanced)**
  - Optionally draw "data edges" from defining state(s) to referencing states
    to visualize variable propagation alongside control flow.
- [x] **5.5 Global variable index view**
  - A tree/list of all variables in the machine; selecting one triggers the
    same highlight behavior without first selecting a state.
- [ ] **5.6 Accessibility & UX**
  - Keyboard navigation, focus states, tooltips, and clear empty/error states.

---

## Phase 6 — Quality, Samples, and Docs

- [x] **6.1 Sample ASL library**
  - Ship `examples/` with JSONata state machines exercising Assign, Map,
    Parallel, Choice, Catch/Retry, and rich variable usage for manual testing.
- [x] **6.2 Integration tests**
  - Open a sample in the Extension Host, assert the model loads, selection and
    highlight messages flow, and click-to-source resolves correctly.
- [x] **6.3 Error handling**
  - Graceful messaging for invalid JSON, non-ASL files, and unsupported
    JSONPath-only documents.
- [x] **6.4 Documentation**
  - README with screenshots/GIFs of the variable-highlight feature, supported
    ASL subset, settings, and a "known limitations" section.
  - `CONTRIBUTING.md` and architecture notes (`docs/architecture.md`).

---

## Phase 7 — Packaging & Release

- [x] **7.1 Package the extension**
  - `vsce package` to produce a `.vsix`; verify `.vscodeignore` trims size.
- [x] **7.2 Marketplace metadata**
  - Icon, categories (`Visualization`, `Other`), keywords, `publisher`,
    gallery banner, `CHANGELOG.md`.
- [~] **7.3 Publish**
  - Release workflow (`.github/workflows/release.yml`) is in place: on a `v*`
    tag it builds, packages, publishes to the VS Code Marketplace and Open VSX
    (guarded on `VSCE_PAT` / `OVSX_PAT` secrets), and attaches the `.vsix` to the
    GitHub release. **Actual publishing is pending** real publisher credentials
    and a `publisher` id registered with the Marketplace.
- [x] **7.4 Versioning**
  - Adopt SemVer; automate changelog and version bump in the release workflow.

---

## Stretch Goals (Backlog)

- [ ] JSONPath query-language support (legacy `InputPath`/`Parameters`/
      `ResultPath`/`OutputPath` and `$.var` references).
- [ ] Live validation against the AWS States Language schema.
- [ ] Diagram export to SVG/PNG and copy-as-image.
- [ ] "Simulate run" overlay highlighting a path for a given input.
- [ ] Integration with AWS Toolkit / reading from deployed state machines.
- [ ] Search across states and variables.

---

## Suggested Milestones

1. **M1 — Walking skeleton:** Phases 0–1 + minimal Phase 2 → open an ASL file
   and render a static placeholder in the webview.
2. **M2 — Graph viewer:** Phases 2 & 4 → full interactive graph with
   click-to-source.
3. **M3 — The differentiator:** Phases 3 & 5 → variable inspector + cross-state
   highlighting (the core value proposition).
4. **M4 — Ship it:** Phases 6 & 7 → tests, docs, packaging, and release.
