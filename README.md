# Step Function Viewer Light

**See your AWS Step Functions as an interactive graph — and follow your data.**

A lightweight, fully-local VS Code viewer for AWS Step Functions state machines
(Amazon States Language, **JSONata**). Open an `.asl.json` or `.asl.yaml` file
and get an interactive diagram with a feature the usual viewers don't have: a
**variable data-flow lens**. Click a state to see every variable it creates and
uses; click a variable to **light up every other state** that assigns or reads
it. No account, no sign-in, no network — it all runs on your machine.

## Usage

Open an Amazon States Language file (`*.asl.json`, `*.asl`, `*.asl.yaml`, or
`*.asl.yml`), then either:

- right-click the file → **Open With… → Step Function Viewer Light**, or
- run **“Open Step Function Viewer Light”** from the Command Palette
  (<kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>).

## Highlights

- 🔎 **Variable data-flow lens (the differentiator).** Click a state to list the
  variables it *creates* and *uses*. Click a variable to highlight every state
  that **defines** it (green) and **references** it (blue), dim the rest, and
  draw data-flow arrows between them.
- 🗺️ **Interactive graph.** Automatic layered layout with pan, zoom, and
  fit-to-screen. Nodes are styled per state type; edges are labeled for
  Choice / Default / Catch.
- 📦 **Clear nesting.** **Parallel** branches and **Map** item processors are
  drawn inside labelled **scope boxes** (purple for Parallel, teal for Map), so
  you can tell exactly what belongs to each. Terminal **Succeed** / **Fail**
  states show as small end balls (green ✓ / red ✕).
- ⚡ **Task integrations at a glance.** Task nodes show what they call inline,
  e.g. `TASK · lambda:invoke`, with the full resource ARN on hover.
- 🔁 **Map iteration aware.** The current item (`$states.context.Map.Item.*`) is
  surfaced as a `<Map>.item` variable so you can see how iteration data flows.
- 🧭 **Finder.** Search the graph by state name, type, or invoked
  function/resource — or prefix with `$` (e.g. `$orderId`) to jump through a
  variable’s usages. <kbd>Enter</kbd> / ‹ › cycle and pan to each match.
- 🔗 **Click-to-source.** Jump from any state — or any exact variable usage — to
  its place in the document.
- ✅ **Inline diagnostics.** Missing `StartAt`, dangling transitions, unreachable
  states, and states with neither `Next` nor `End` are reported in the Problems
  panel.
- 🌓 Matches your VS Code theme (light / dark / high-contrast).

## Supported ASL

- **State types:** `Task`, `Choice`, `Parallel`, `Map`, `Pass`, `Wait`,
  `Succeed`, `Fail`.
- **Transitions:** `Next`, `End`, Choice `Choices` / `Default`, `Catch`, and
  entry into `Parallel` branches and `Map` item processors
  (`ItemProcessor` / `Iterator`).
- **Query language:** **JSONata** is the target for variable analysis. JSONPath
  machines still render, but report no user variables.
- **Formats:** **JSON** (`*.asl.json`, `*.asl`) and **YAML** (`*.asl.yaml`,
  `*.asl.yml`) — e.g. a state machine exported as YAML from Workflow Studio.

## Privacy

Everything runs **locally**. This extension has **no telemetry, no analytics,
and makes no network requests**. It only reads the content of the file you open
— it does not read other files, write to disk, run external programs, or send
any data anywhere. Nothing you open or view leaves your computer.

## Disclaimer & terms

Provided **“AS IS”, without warranty of any kind**, and used **at your own
risk**; the author and contributors are **not liable** for any damages or other
liability arising from its use. This is an **independent, unofficial** tool and
is **not affiliated with or endorsed by Amazon Web Services**. See
[DISCLAIMER.md](DISCLAIMER.md) for the full terms.

## License

MIT — see [LICENSE](LICENSE).
