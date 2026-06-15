# Changelog

All notable changes to the Step Function Viewer extension are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Custom editor for `*.asl.json` / `*.asl` files.
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
