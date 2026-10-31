# Examples

Small apps that show how to use the library
They live in the repository only:
`package.json` `files` is an allowlist and `scripts/pack/check-package.ts`
fails if `examples/` reaches the tarball
They import the package the way a
consumer does (`winui-svelte`, `winui-svelte/components`, `winui-svelte/state`,
...)

## Run one

From the package's folder, after `pnpm build`:

```sh
node --disable-warning=ExperimentalWarning --enable-source-maps \
  examples/harness/launch.ts examples/gallery/main.ts
```

Swap `gallery` for any app below
The harness serves the app's modules through
Vite, opens the window and prints what the app reports as JSON lines
Add
`--file <path>` where an app saves something; set `WINUI_SVELTE_BACKGROUND=1`
to keep every window off screen and unactivated (what the tests do)

## The apps

| App | What it shows |
|---|---|
| `gallery` | A NavigationView with a page per area: state, forms, layout, lists, overlays, theming, templates, window, services, media, text, input, data, animation, CSS layout, Win2D, tray |
| `todo` | A real app: host state saved to a file, a keyed ListView, a confirm dialog and an InfoBar |
| `settings` | App structure: NavigationView pages, forms, a theme switch, a window with its own title bar |
| `stores` | Svelte's stores and `$store`, `svelte/motion` and `svelte/reactivity` on WinUI controls, with the subscriptions counted |
| `counter`, `hello`, `lists`, ... | The focused examples the tests drive |

`test/examples.test.ts` mounts the gallery, todo and settings in a real window
and checks that every page shows its key control and that the app closes
cleanly
It is part of `pnpm test:windows`

## Shared by the apps

- `harness/smoke.ts`: `keyControl`
  (an attachment that lists a control as on screen) and `serveExample` (the
  `stats` and `close` commands)
- `harness/memory-host.ts`: a host that owns a named state in the same
  process, over an in-memory link, with a reducer for the actions

## Adding a gallery page

A page is a component in `gallery/pages`, a row in `gallery/pages.ts` and a
`keyControl` on its main control; the test then visits it by itself
Write it
with what `API.md` documents, run `node --test test/examples.test.ts`, and add
its area to the table above
