# Contributing to winui-svelte

Windows only (the package draws WinUI 3 windows), Node 24 or newer, and **pnpm**
(the version in `package.json`'s `packageManager`; `corepack enable` picks it
up)
No npm, no yarn, no second lockfile

The coding rules are in [CLAUDE.md](CLAUDE.md): Google's TypeScript style guide,
plus the house rules that sit on top of it
Read it before sending code

## Set up

```powershell
pnpm install
pnpm restore      # downloads the Windows App SDK and its metadata
pnpm bindings     # generates the WinUI bindings, then WebView2's
```

`pnpm install` also installs the pre-commit hook (simple-git-hooks, into the
repository's shared hooks folder, so every worktree has it): on the staged files
it runs oxlint `--fix`, ESLint `--fix` and oxlint, then `pnpm fallow:audit`
(`lint-staged.config.js`); a commit with a finding is refused, and the hook is
never skipped

`pnpm restore` reads `winapp.yaml` and writes `.winapp/`, which is not
committed
`pnpm bindings` reads `package.json`'s `winapp.jsBindings` (the list
of WinUI classes) and writes `.winapp/bindings` in two steps: `winapp node
generate-bindings`, then `scripts/bindings/after-winapp.ts`. The second exists
because winapp gives the code generator no `Microsoft.Web.WebView2.Core`
metadata (so WebView2's events cannot be bound in its run) and trips over
`SwapChainPanel`'s two `PointerEventArgs`
Those classes are in
`bindingsAfterWinapp` in `scripts/codegen/tables.ts`, which keeps them out of the
list winapp is given; the step runs the generator for them alone, adds
the files winapp's run did not make, and restores `Microsoft.Web.WebView2.Core.dll`
beside the bootstrappers
The same step does it for every package of
`extraPackages` (Win2D, whose winmd it generates whole) and for `lateClasses`
(single Windows App SDK classes the Win2D helpers need), so a class of those
lists is added by running `pnpm bindings:after-winapp`, not the full run
The first run downloads the SDK and takes about ten
minutes; it is a cache after that
Run `pnpm bindings` again when the class
list changes (`pnpm gen:components` rewrites it)

The components import the bindings as `#winui/*`, which `package.json`'s
`imports` map to `dist/bindings`: `pnpm build` copies `.winapp/bindings` there,
along with the native libraries in `dist/bin/<architecture>` (the Windows App
SDK bootstrapper, `WebView2Loader.dll` and `Microsoft.Web.WebView2.Core.dll`),
so the published package carries them all and an app installs only
`winui-svelte`
Build once before `pnpm check` or the examples

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm build` | compiles `src` into `dist/` (what is published); returns in about 2 seconds when nothing it reads changed since the last build (`pnpm build --force` rebuilds) |
| `pnpm lint` | every check, side by side (at most 4 at once, the steps that read `dist/` after the build, each step's output printed whole when it ends) and all of them even when one fails: build, oxlint, ESLint (Google TypeScript style and the house rules in `CLAUDE.md`), stylelint, `tsc`, `svelte-check`, the editor checks (VS Code and WebStorm), fallow, the generated-files check and the tarball check |
| `pnpm lint:eslint` | ESLint on all cores with a cache under `.verify`; the quick loop while editing (a cached type-aware result can lag a change in another file's types, so `pnpm lint` runs `lint:eslint:full`, uncached) |
| `pnpm lint:fix` | the fixers over the whole tree: oxlint `--fix` (with `.oxlintrc.fix.json`, which leaves unused variables to ESLint), ESLint `--fix` (which also removes unused imports), then oxlint |
| `pnpm fallow:audit` | fallow on what changed against `HEAD` only |
| `pnpm lint:summary` | counts the violations per rule and per folder (`--folder src/css` lists one folder's files) |
| `pnpm test` | build, then every unit test and the mount test (every component made in a real WinUI window that opens off screen and never takes focus) |
| `pnpm bindings` | the WinUI bindings in `.winapp/bindings`: winapp's run, then WebView2's (`scripts/bindings/`) |
| `pnpm test:windows` | every `test/*.test.ts` that opens real windows (all but the mount test), one file at a time, in the background (see below). Needs an ordinary desktop session |
| `pnpm gen:components` | regenerates `src/components/generated`, the class list in `package.json` and the tables in the README from WinUI's metadata. Never edit those files by hand |
| `pnpm check:svelte-matrix` | runs the Svelte-facing tests against every release of the peer range (slow; see "Svelte versions") |
| `pnpm check:package` | packs the tarball and runs publint and Are The Types Wrong on it |

Examples and tests resolve `winui-svelte` the way a consumer does, through
`package.json`'s `exports`, which point at `dist/`: run `pnpm build` after
changing `src/` and before running an example

## Tests that need a desktop session

Every test window runs in the background, so you can keep working on the same
desktop while they run: `WINUI_SVELTE_BACKGROUND=1` (set by `pnpm test:windows`
and by `test/example-process.ts`, read by `src/window/background-mode.ts`)
makes each window open left of every display (computed from the virtual
screen, never a fixed coordinate), never activate it, never keep it always on
top and give it no taskbar button or Alt+Tab entry (`WS_EX_NOACTIVATE` and
`WS_EX_TOOLWINDOW`); WinUI still lays out, paints and answers UI Automation
Write a window test with `ExampleProcess` and it is in the background with no
further work; a test that makes a `Window` of its own calls
`backgroundPlacement` and `keepInBackground` (`src/window/background.ts`)

What cannot be hidden:

- A tray icon is in the real notification area while its test runs
  (`test/tray.test.ts` stays on the default desktop, see below)
- WebView2 starts browser processes of its own (they end with the window), and
  its browser does not start on another desktop, so `test/web.test.ts` stays
  on the default desktop
- A combo box's drop-down is a window of its own that WinUI keeps on the
  nearest display, so it shows for a moment at the edge of the display next to
  the off-screen window
- Popups that can stay inside their window (flyouts, menus) are made to, in a
  background run

Off screen and no-activate do not keep the foreground by themselves: focusing
a control (a form's first invalid field, a UI Automation `Invoke` or
`SetFocus`) activates its window whatever its styles say, and the person at
the desk loses their window for as long as the test runs
So `scripts/test-windows.ts` starts each file on a desktop object of its own
(`scripts/desktop/run-on-desktop.ps1`: `CreateDesktopW`, then `CreateProcessW`
with that desktop; every process the test starts, the examples and the
UI Automation scripts, inherits it), and a window there can
never take the foreground; UI Automation, WinUI and Win2D work on it
Two files cannot run there and stay on the default desktop, where they were
measured not to take the foreground (`DEFAULT_DESKTOP_TESTS` in the script):
`tray.test.ts` (the notification area is the shell's) and `web.test.ts`
(WebView2's browser does not start)
Set `WINUI_SVELTE_TEST_DESKTOP=default` to run every file on the default
desktop instead; a file run with `node --test` directly is not on its own
desktop either, so run it through the script
(`pnpm test:windows test/forms.test.ts`)

Start the whole run and read the result later:

```sh
pnpm test:windows
cat .verify/test-windows.txt
```

`scripts/test-windows.ts` runs the files one at a time at below-normal
priority, each with a timeout of ten minutes; `.verify/test-windows.txt` has a
PASS, FAIL or TIMEOUT line per file, `.verify/test-windows/<name>.log` the spec
output and `<name>.xml` the JUnit report; name files to run only those
(`pnpm test:windows test/web.test.ts`)
Run each file as its own scheduled task when the machine is shared
Every scheduled task for a window test uses the action
`conhost.exe --headless cmd.exe /c "<file>.cmd"`; a bare `.cmd` pops a
visible console onto the desktop of whoever is working (the processes the
scripts spawn pass `windowsHide`, so they show none)

WebView2 starts a real browser process, so run from
an ordinary desktop session: a process a sandbox or a service started cannot
launch the browser (WebView2 reports 0x8007139F), and the tests skip where the
Windows App SDK was not restored or the WebView2 Runtime is not installed

Tests must never inject real input into the desktop of whoever runs them: no
`SetCursorPos`, `mouse_event`, `SendInput`, `keybd_event`, no clicks on the
taskbar or the notification area, and no messages posted to windows the test
did not create
Check what a window shows by asking WinUI or the shell
(`Shell_NotifyIconGetRect` for a tray icon), and drive the code under test
through its own commands or a fake of the Win32 layer

## Changing what is generated

Everything the generator decides by hand is a table in
`scripts/codegen/tables.ts`; nothing else decides it

- **A new family of value objects or controls:** add its abstract base to
  `rootClasses`
  Every concrete class below a root becomes a component, and a
  property typed as one becomes a snippet prop
  A class WinUI activates but the
  generator must leave out goes in `nonConstructible` with the reason (the mount
  test finds them)
- **A control that shows its items by snippet:** add it to `itemsHosted` with
  the host that fits (`list` for a `ListViewBase`, `repeater` for an
  `ItemsRepeater`, `itemContainer` for an `ItemContainer` root)
  The hosts are
  in `src/components/hand-written/items`; the component then takes `items`,
  `key` and `item` in place of its children and items source
- Then run `pnpm gen:components` (it rewrites the components, the class list in
  `package.json` and the README tables), `pnpm bindings` (the new classes need
  bindings) and `pnpm test`
  Put what the new components must do in
  `test/Slots.fixture.svelte` and its expectations in `test/mount-all.svelte.ts`
  (a value object in a property, items written with `{#each}`), and an emission
  test beside the generator when the output's shape changes
  (`scripts/codegen/emit-hosted.test.ts`)

## Coverage of WinUI's classes

`scripts/codegen/coverage.test.ts` reads every class of WinUI's metadata and
fails for one that is not a component, hand-written, non-constructible, an
abstract base, or in `scripts/codegen/not-components.ts` with a reason (a
single entry, a name pattern, or `knownGaps` for what should become a
component)
A WinUI update that adds a class fails it until the class is
sorted
The counts and the gaps are committed in
`scripts/codegen/coverage.json`; `UPDATE_COVERAGE=1` rewrites it

## Editor integration

Two checks run what an editor underlines, so a pass in `pnpm lint` means the
editor is clean too:

| Check | Asks | Notes |
| --- | --- | --- |
| `pnpm check:editor` | the Svelte language server VS Code's Svelte extension runs | any diagnostic, and any inlay hint where a type collapsed to `any`, fails |
| `pnpm check:webstorm` | WebStorm's own command-line inspections | runs where WebStorm is installed (`WEBSTORM_HOME`, the per-user install, the Toolbox, Program Files) and the Svelte plugin is in its config; elsewhere it skips and passes. About a minute; `--require` makes a missing WebStorm a failure |

`check:webstorm` starts a WebStorm of its own, isolated under `.verify/webstorm`,
so it is safe to run while WebStorm is open on this project
Its checks are
listed in `scripts/editor/webstorm/profile.xml`

To make your editor show what the checks see:

- **VS Code**: install the Svelte extension
  Its server uses the workspace's
  TypeScript and Svelte; the `svelte.language-server.ls-path` user setting can
  point it at this repo's `node_modules/svelte-language-server/bin/server.js`,
  the pinned and patched server the check runs
- **WebStorm**: install the Svelte plugin (Settings, Plugins, Marketplace)
  Under
  Settings, Languages & Frameworks, TypeScript, leave the language service on and
  choose this repo's TypeScript (`node_modules/typescript/lib`); under
  Svelte, use this repo's `svelte` package
  The `#src/*`, `#scripts/*` and
  `#examples/*` imports are read from `package.json`

## The Svelte build

winui-svelte runs on a published Svelte (the `svelte` devDependency is the one
the package is developed on, and the peer range `5.51.1 - 5.57.3` is the span
the matrix below proves)
It adds no compiler
option: components compile with Svelte's own compiler, and the tree draws as a
DOM (`src/renderer/tree/dom.ts`, `document.ts`)
A few spots of Svelte's
client runtime are read with edits (`src/vite/runtime-patch.ts`); each edit is
an anchor matched by its tokens (whitespace may differ), and a Svelte release
that moves one makes the plugin and `svelteHooks()` throw, naming the file and
the release
An edit marked optional is for releases that still have its anchor

## The fast loop

The dev server (`src/vite`) is what an app author waits on
Cold start of `examples/hello` (the window is up) went from about 9 s to
about 3 s, and a saved edit shows in about 0.25 s with the window's state kept
- A named import from `winui-svelte/components` is rewritten, in `serve`
  only, to imports of the modules that declare the names
  (`src/vite/barrel.ts`); the window then fetches the controls it uses, not
  all six hundred
  A new barrel the package exports goes in `BARRELS`
- A `<style>` is translated once per content: the validator and the sheet
  module share one translation (`translateComponent`), and an edit that
  leaves the style alone translates nothing
- A component is parsed for animation directives only when its source writes
  one

## Svelte versions

`pnpm check:svelte-matrix` proves the peer range
`scripts/svelte-matrix/versions.json` lists the releases, each with the
integrity the npm registry publishes
For each one it installs that exact release from the registry into
`.verify/svelte-<version>` with its own `pnpm install --ignore-workspace
--ignore-scripts` (the shared `node_modules` is never touched), checks the
integrity, and runs the renderer, host, tree, blocks and transition tests, and
the anchor test, with `WINUI_SVELTE_SVELTE_ROOT` pointing the loader (and the
Svelte compiler) at that copy
It takes about a minute, so `pnpm lint` does not run it; run it before a
release and after any edit of `runtime-patch.ts`
`pnpm check:svelte-matrix --version 5.57.3` runs one release

To add a Svelte release
- add it to `versions.json` with its integrity (`npm view svelte@<version>
  dist.integrity`), in order, and run `pnpm check:svelte-matrix --version
  <version>`
- if an anchor moved, change `runtime-patch.ts` so one edit matches both
  shapes, or mark the edit optional when the older releases alone have it
- the peer range in `package.json` must read `<oldest> - <newest>` of the list
  (`scripts/svelte-matrix/peer-range.test.ts` fails otherwise)
- run `pnpm test` (the bundle test reads the one-Button size)

## Patches

`patches/svelte-language-server@0.18.5.patch` (applied by pnpm through
`patchedDependencies` in `pnpm-workspace.yaml`) stops the editor check from
reporting the inlay hints svelte2tsx writes for a component's content snippet
It affects only `pnpm check:editor`, never the published package
Drop it when
a language-server release fixes the hint

## Releasing

Releases go out only when the maintainer asks: bump `version`, `pnpm lint`,
`pnpm test`, commit, tag `vX.Y.Z` and push; the publish workflow runs
`pnpm publish --provenance`
`pnpm pack --dry-run` shows what will ship, which
must never include `CLAUDE.md`, the tests or the test support; it does include
`dist` with its source maps and the `src` TypeScript they point at
