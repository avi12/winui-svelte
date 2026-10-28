# Contributing to winui-svelte

Windows only (the package draws WinUI 3 windows), Node 24 or newer, and **pnpm**
(the version in `package.json`'s `packageManager`; `corepack enable` picks it
up). No npm, no yarn, no second lockfile.

The coding rules are in [CLAUDE.md](CLAUDE.md): Google's TypeScript style guide,
plus the house rules that sit on top of it. Read it before sending code.

## Set up

```powershell
pnpm install
pnpm restore      # downloads the Windows App SDK and its metadata
pnpm bindings     # generates the WinUI bindings, then WebView2's
```

`pnpm restore` reads `winapp.yaml` and writes `.winapp/`, which is not
committed. `pnpm bindings` reads `package.json`'s `winapp.jsBindings` (the list
of WinUI classes) and writes `.winapp/bindings` in two steps: `winapp node
generate-bindings`, then `scripts/bindings/after-winapp.ts`. The second exists
because winapp gives the code generator no `Microsoft.Web.WebView2.Core`
metadata (so WebView2's events cannot be bound in its run) and trips over
`SwapChainPanel`'s two `PointerEventArgs`. Those classes are in
`bindingsAfterWinapp` in `scripts/codegen/tables.ts`, which keeps them out of the
list winapp is given; the step runs the generator for them alone, adds
the files winapp's run did not make, and restores `Microsoft.Web.WebView2.Core.dll`
beside the bootstrappers. The first run downloads the SDK and takes about ten
minutes; it is a cache after that. Run `pnpm bindings` again when the class
list changes (`pnpm gen:components` rewrites it).

The components import the bindings as `#winui/*`, which `package.json`'s
`imports` map to `dist/bindings`: `pnpm build` copies `.winapp/bindings` there,
along with the native libraries in `dist/bin/<architecture>` (the Windows App
SDK bootstrapper, `WebView2Loader.dll` and `Microsoft.Web.WebView2.Core.dll`),
so the published package carries them all and an app installs only
`winui-svelte`. Build once before `pnpm check` or the examples.

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm build` | compiles `src` into `dist/` (what is published) |
| `pnpm lint` | every check, one after another even when one fails: build, oxlint, ESLint (Google TypeScript style and the house rules in `CLAUDE.md`), stylelint, `tsc`, `svelte-check`, the editor checks (VS Code and WebStorm), fallow, the generated-files check and the tarball check |
| `pnpm lint:summary` | counts the violations per rule and per folder (`--folder src/css` lists one folder's files) |
| `pnpm test` | build, then every unit test and the mount test (every component made in a real WinUI window that opens off screen and never takes focus) |
| `pnpm bindings` | the WinUI bindings in `.winapp/bindings`: winapp's run, then WebView2's (`scripts/bindings/`) |
| `pnpm test:windows` | the examples in real windows: `test/lists.test.ts`, `test/items.test.ts`, `test/web.test.ts` and `test/window.test.ts`. Needs an ordinary desktop session (see below) |
| `pnpm gen:components` | regenerates `src/components/generated`, the class list in `package.json` and the tables in the README from WinUI's metadata. Never edit those files by hand |
| `pnpm check:package` | packs the tarball and runs publint and Are The Types Wrong on it |

Examples and tests resolve `winui-svelte` the way a consumer does, through
`package.json`'s `exports`, which point at `dist/`: run `pnpm build` after
changing `src/` and before running an example.

## Tests that need a desktop session

The mount test opens its window off screen, but WebView2 starts a real browser
process, and the window tests drive real windows. Run `pnpm test:windows` from
an ordinary desktop session: a process a sandbox or a service started cannot
launch the browser (WebView2 reports 0x8007139F), and the tests skip where the
Windows App SDK was not restored or the WebView2 Runtime is not installed.

## Changing what is generated

Everything the generator decides by hand is a table in
`scripts/codegen/tables.ts`; nothing else decides it.

- **A new family of value objects or controls:** add its abstract base to
  `rootClasses`. Every concrete class below a root becomes a component, and a
  property typed as one becomes a snippet prop. A class WinUI activates but the
  generator must leave out goes in `nonConstructible` with the reason (the mount
  test finds them).
- **A control that shows its items by snippet:** add it to `itemsHosted` with
  the host that fits (`list` for a `ListViewBase`, `repeater` for an
  `ItemsRepeater`, `itemContainer` for an `ItemContainer` root). The hosts are
  in `src/components/hand-written/items`; the component then takes `items`,
  `key` and `item` in place of its children and items source.
- Then run `pnpm gen:components` (it rewrites the components, the class list in
  `package.json` and the README tables), `pnpm bindings` (the new classes need
  bindings) and `pnpm test`. Put what the new components must do in
  `test/Slots.fixture.svelte` and its expectations in `test/mount-all.svelte.ts`
  (a value object in a property, items written with `{#each}`), and an emission
  test beside the generator when the output's shape changes
  (`scripts/codegen/emit-hosted.test.ts`).

## Editor integration

Two checks run what an editor underlines, so a pass in `pnpm lint` means the
editor is clean too:

| Check | Asks | Notes |
| --- | --- | --- |
| `pnpm check:editor` | the Svelte language server VS Code's Svelte extension runs | any diagnostic, and any inlay hint where a type collapsed to `any`, fails |
| `pnpm check:webstorm` | WebStorm's own command-line inspections | runs where WebStorm is installed (`WEBSTORM_HOME`, the per-user install, the Toolbox, Program Files) and the Svelte plugin is in its config; elsewhere it skips and passes. About a minute; `--require` makes a missing WebStorm a failure |

`check:webstorm` starts a WebStorm of its own, isolated under `.verify/webstorm`,
so it is safe to run while WebStorm is open on this project. Its checks are
listed in `scripts/editor/webstorm/profile.xml`.

To make your editor show what the checks see:

- **VS Code**: install the Svelte extension. Its server uses the workspace's
  TypeScript and Svelte; the `svelte.language-server.ls-path` user setting can
  point it at this repo's `node_modules/svelte-language-server/bin/server.js`,
  the pinned and patched server the check runs.
- **WebStorm**: install the Svelte plugin (Settings, Plugins, Marketplace). Under
  Settings, Languages & Frameworks, TypeScript, leave the language service on and
  choose this repo's TypeScript (`node_modules/typescript/lib`); under
  Svelte, use this repo's `svelte` package. The `#src/*`, `#scripts/*` and
  `#examples/*` imports are read from `package.json`.

## The Svelte build

winui-svelte needs the Svelte build that adds the custom-renderer option
(sveltejs/svelte#18042). `package.json`'s `svelte` devDependency installs it
from pkg.pr.new, and the Vite plugin refuses to start with a Svelte that lacks
the option, saying what to install.

## Releasing

Releases go out only when the maintainer asks: bump `version`, `pnpm lint`,
`pnpm test`, commit, tag `vX.Y.Z` and push; the publish workflow runs
`pnpm publish --provenance`. `pnpm pack --dry-run` shows what will ship, which
must never include `CLAUDE.md`, the tests or the test support; it does include
`dist` with its source maps and the `src` TypeScript they point at.
