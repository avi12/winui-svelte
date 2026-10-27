# Contributing to winui-svelte

Windows only (the package draws WinUI 3 windows), Node 24 or newer, and **pnpm**
(the version in `package.json`'s `packageManager`; `corepack enable` picks it
up). No npm, no yarn, no second lockfile.

The coding rules are in [CLAUDE.md](CLAUDE.md): Google's TypeScript style guide,
plus the house rules that sit on top of it. Read it before sending code.

## Set up

```powershell
pnpm install
pnpm restore      # downloads the Windows App SDK and generates the WinUI bindings
```

`pnpm restore` reads `winapp.yaml` and `package.json`'s `winapp.jsBindings` (the
list of WinUI classes) and writes `.winapp/`, which is not committed. The first
run downloads the SDK and generates the bindings for every class in the list,
and takes about ten minutes; it is a cache after that. The components import
those bindings as `#winui/*`, which `package.json`'s `imports` map to
`@winapp/bindings`, a link to `.winapp/bindings`.

A consuming app does the same with one command, `winui-svelte setup`
(`src/cli`), which writes its `winapp.yaml`, adds the classes the package needs
to its `package.json` and runs `winapp`.

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm build` | compiles `src` into `dist/` (what is published) |
| `pnpm lint` | every check, one after another even when one fails: build, oxlint, ESLint (Google TypeScript style and the house rules in `CLAUDE.md`), stylelint, `tsc`, `svelte-check`, the editor check, fallow, the generated-files check and the tarball check |
| `pnpm lint:summary` | counts the violations per rule and per folder (`--folder src/css` lists one folder's files) |
| `pnpm test` | build, then every unit test and the mount test (every component made in a real WinUI window that opens off screen and never takes focus) |
| `pnpm test:windows` | the example windows, checked through UI Automation |
| `pnpm gen:components` | regenerates `src/components/generated` from WinUI's metadata. Never edit those files by hand |
| `pnpm check:package` | packs the tarball and runs publint and Are The Types Wrong on it |

Examples and tests resolve `winui-svelte` the way a consumer does, through
`package.json`'s `exports`, which point at `dist/`: run `pnpm build` after
changing `src/` and before running an example.

## The Svelte build

winui-svelte needs the Svelte build that adds the custom-renderer option
(sveltejs/svelte#18042). `package.json`'s `svelte` devDependency installs it
from pkg.pr.new, and the Vite plugin refuses to start with a Svelte that lacks
the option, saying what to install.

## Releasing

Releases go out only when the maintainer asks: bump `version`, `pnpm lint`,
`pnpm test`, commit, tag `vX.Y.Z` and push; the publish workflow runs
`pnpm publish --provenance`. `pnpm pack --dry-run` shows what will ship, which
must never include `CLAUDE.md`, `src/` or the tests.
