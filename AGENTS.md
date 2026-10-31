# winui-svelte for coding agents

This file is for an agent that writes an app with winui-svelte
It is published with the package; the repository's own contributor rules are in
`CLAUDE.md`, which is not

## What you are writing

- Svelte 5 components that draw native WinUI 3 controls; there is no DOM and no
  browser engine
- Windows only; the window runs in a Node process that a host starts (Tauri,
  Electron or a terminal)
- Read `README.md` first, then `API.md` for the exact signatures

## Rules that make code compile and run

- Import components in PascalCase from `winui-svelte/components`
  (`import { StackPanel, TextBlock } from "winui-svelte/components"`), and
  closed sets of values from `winui-svelte/enums`, never as string literals
- Text goes in as the child of the component: `<TextBlock>Hello</TextBlock>`
- Layout and look are scoped CSS in the component's `<style>`: native units only
  (`px`, `deg`, `s`, `ms`, `fr`, `auto`, plain numbers), no `%` or `rem`
- Event props mirror the DOM and are all lowercase: `onclick`, `ontoggled`,
  `onselectionchanged`, never `onClick` or `onToggled`
- Props are WinUI's own property names in `lowerCamelCase`; a wrong prop or a
  wrong value type fails `svelte-check`, so run it
- State between the host and the window goes through `winui-svelte/state`
  (`hostState`, `send`); the host and the window talk in JSON lines
- Stdio belongs on the sidecar's main thread, which relays to the UI-thread
  worker; never read `process.stdin` in the worker
- Ship with `buildApp` from `winui-svelte/vite`, and leave minify off

## Checking your work

- Add `winuiDiagnostics()` from `winui-svelte/preprocess` to `svelte.config.js`
  so scoped classes on components do not warn
- Run `svelte-check` and the unit tests after every change
- A window test needs an ordinary desktop session; run it on a hidden desktop
  where you can, and never inject real mouse or keyboard input
- An error from the UI thread prints its stack; read it before guessing

## Do not

- Use `any`, `export default` (a `.svelte` file excepted) or an em dash
- Invent a component: every WinUI 3 control exists, so look it up in the
  controls table of `README.md` and follow its link to the WinUI docs
- Edit anything under `node_modules` or the generated bindings
