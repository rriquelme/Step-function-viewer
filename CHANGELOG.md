# Changelog

All notable changes to the Step Function Viewer Light extension are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.3]

### Changed

- Rewrote the README as a concise, user-facing Marketplace page (highlights,
  usage, supported ASL, privacy, terms); removed the developer-oriented
  Settings, Examples, Getting Started, and Architecture sections.

## [0.1.2]

### Changed

- Set the Marketplace **publisher** to `RobertoRiquelmeSaez` so the extension can
  be published (the manifest previously used a placeholder publisher id).

## [0.1.1]

### Changed

- **Renamed to "Step Function Viewer Light"** (extension id
  `step-function-viewer-light`). Command, view, and setting identifiers are
  unchanged, so existing settings keep working.

### Added

- **Terms / disclaimer & privacy statement** ([DISCLAIMER.md](DISCLAIMER.md) and
  README): the software is provided "as is" with no warranty and no liability;
  it is an independent, unofficial tool not affiliated with AWS. Documented that
  the extension is fully local — no telemetry, no analytics, no network requests.

### Changed

- Publish-readiness hardening: source maps are no longer shipped in the packaged
  extension, and the webview CSP `img-src` was tightened (dropped `https:`, since
  no remote images are ever loaded).

## [0.0.9]

### Added

- **Map iteration item as a variable.** References to the current item
  (`$states.context.Map.Item.Value` / `.Index`, or legacy `$$.Map.Item.*`) are
  now surfaced as a synthetic `<Map>.item` variable: the Map "defines" it and the
  states that read it "reference" it, so selecting it highlights (and draws
  data-flow edges for) the iteration. Variables assigned inside Map/Parallel
  scopes were already tracked per nested state; this fills the last gap.
- New `examples/map-iteration.asl.yaml` demonstrating iteration-local variables,
  the item context, and an outer variable used inside the processor.

### Fixed

- **View no longer jumps on resize.** Resizing the window/editor (e.g. toggling
  split view) keeps whatever was centered in view instead of losing the graph.

## [0.0.8]

### Changed

- **Toolbar order & title:** the title now stacks on three lines
  (Step / Function / Viewer) to save horizontal space, and the items are ordered
  title → run info (2×2) → zoom tools → finder → highlight controls.

## [0.0.7]

### Changed

- **Tidier toolbar:** the badge "chips" are gone. Run info is now plain text in
  two compact columns (Query / StartAt, then states / variables), and the search
  box sits on the left and grows to fill — so it stays usable in split view. The
  toolbar wraps gracefully when narrow.

## [0.0.6]

### Changed

- **Task nodes show their integration** in the type label, e.g.
  `TASK · lambda:invoke` (or `TASK · dynamodb:putItem`), condensed from the
  state's `Resource`. The full ARN is in the node's hover tooltip. Node width
  grows to fit the label.

## [0.0.5]

### Added

- **Finder now searches variables too.** Prefix the query with `$` (e.g.
  `$orderId`) to search variables instead of states — matches are the states
  that define or reference the variable, so cycling pans through its usages. The
  `$` convention disambiguates a state and a variable that share a name; the
  match counter shows `var n/m` in variable mode.

## [0.0.4]

### Added

- **Finder:** a search box in the toolbar matches states by name, type, and the
  Lambda/resource (function) a Task invokes. Matches are outlined; Enter (and the
  ‹ › buttons) cycle through them, panning the graph to center each match.
  Invaluable on large machines.

## [0.0.3]

### Changed

- **Nested layout:** Parallel/Map sub-graphs are now laid out in isolation and
  inserted into the parent as a single block, so a container's box encloses
  exactly its own states. A container's `Next` successor (e.g. a `Done` state
  after a Map) is now placed clearly *outside* the box, removing the earlier
  ambiguity about what belongs to a Parallel/Map.

### Added

- **End balls:** terminal states (`Succeed` / `Fail`) render as a small circle
  (green ✓ / red ✕) instead of a rectangle, making endpoints obvious.

## [0.0.2]

### Added

- **Scope boxes:** each Parallel and Map draws a labelled, translucent boundary
  around its nested states. Parallel scopes are purple and Map scopes are teal,
  with matching node borders and `branch` / `map` edge colors.

## [0.0.1]

### Added

- Custom editor for `*.asl.json` / `*.asl` and `*.asl.yaml` / `*.asl.yml` files.
- YAML support with position-aware click-to-source (parsed via the `yaml`
  package), so a state machine exported as YAML renders just like JSON.
- Interactive SVG graph (dagre layout) with pan, zoom, and fit-to-screen;
  per-state-type nodes and labeled, per-kind edges (`next`, `choice`, `default`,
  `catch`, `branch`, `map`).
- **Variable inspector:** click a state to list the variables it creates and
  uses; click a variable to highlight every state that defines (green) or
  references (blue) it, dimming the rest.
- Global variable sidebar with definition/reference counts and a detail view
  whose entries jump to the **exact** assigning/referencing expression in source.
- **Data-flow edges:** selecting a variable overlays dashed edges from each
  defining state to each referencing state.
- Accessibility: keyboard-focusable graph nodes with Enter/Space activation,
  node tooltips and aria labels, focusable variable/usage lists, and a legend.
- JSONata variable analysis: extracts `$variable` references while excluding
  built-in functions, reserved context (`$states`, `$$`), expression-local
  bindings, and string literals.
- Structural diagnostics in the Problems panel: missing `StartAt`, dangling
  transitions, unreachable states, and states with neither `Next` nor `End`.
- Click-to-source navigation (node double-click or sidebar "source" button).
- Settings: `stepFunctionViewer.layoutDirection` (TB/LR) and
  `stepFunctionViewer.autoOpen`.

### Known limitations

- Visual nesting of Parallel branches / Map item processors is shown via edges
  rather than cluster boxes (see `plans/01-project-plan.md`, step 4.5).
- Variable analysis targets JSONata; JSONPath (`$.foo`) machines render but
  report no user variables.
