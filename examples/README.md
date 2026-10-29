# Examples

Small apps that show how to use the library. They live in the repository only:
`package.json` `files` is an allowlist and `scripts/pack/check-package.ts`
fails if `examples/` reaches the tarball. They import the package the way a
consumer does (`winui-svelte`, `winui-svelte/components`, `winui-svelte/state`,
...).

## Run one

From the package's folder, after `pnpm build`:

```sh
node --disable-warning=ExperimentalWarning --enable-source-maps \
  examples/harness/launch.ts examples/gallery/main.ts
```

Swap `gallery` for any app below. The harness serves the app's modules through
Vite, opens the window and prints what the app reports as JSON lines. Add
`--background yes` to keep the window off screen and unactivated (what the
tests do), and `--file <path>` where an app saves something.

## The apps

| App | What it shows |
|---|---|
| `gallery` | A NavigationView with a page per area: state, forms, layout, lists, overlays, theming, templates, window, services, media, text, input, data |
| `todo` | A real app: host state saved to a file, a keyed ListView, a confirm dialog and an InfoBar |
| `settings` | App structure: NavigationView pages, forms, a theme switch, a window with its own title bar |
| `counter`, `hello`, `lists`, ... | The focused examples the tests drive |

`test/examples.test.ts` mounts the gallery, todo and settings in a real window
and checks that every page shows its key control and that the app closes
cleanly. It is part of `pnpm test:windows`.

## Shared by the apps

- `harness/smoke.ts`: `windowDefaults` (off screen for a test), `keyControl`
  (an attachment that lists a control as on screen) and `serveExample` (the
  `stats` and `close` commands).
- `harness/memory-host.ts`: a host that owns a named state in the same
  process, over an in-memory link, with a reducer for the actions.

## Pages still to add to the gallery

A page is a component in `gallery/pages`, a row in `gallery/pages.ts` and a
`keyControl` on its main control; the test then visits it by itself. Two pages
wait for features that are not on `main` yet. Add each when its branch merges,
and use only what `API.md` then documents.

- [ ] Animation and transitions: `transition:`, `in:`, `out:` and `animate:`
  directives, and CSS `animation` with `@keyframes`. Today the package refuses
  the directives at compile time and offers the `winui-svelte/element-animation`
  attachments instead.
- [ ] CSS layout: `display: flex` with its alignment and wrapping, `position`
  with `top`, `left` and the rest, and media queries on size.

For each: write the page, list it in `pages.ts`, run
`node --test test/examples.test.ts`, and move the line from this list to the
table above.
