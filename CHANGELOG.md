# Changelog

All notable changes to this project are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Components: every WinUI 3 control as a Svelte 5 component, generated from
  WinUI's metadata, with typed props, events and `bind:` support.
- Renderer: a tree that Svelte draws into as if it were the DOM, creating and
  updating WinUI controls, with keyed lists and item hosts. It runs on a
  published Svelte (peer range `~5.56.7`); no Svelte pull request or build is
  needed.
- Window: `runWindow`, `createWindow`, window chrome, backdrops, pickers,
  timers and live system settings.
- App: single-instance handling and app notifications (`winui-svelte/app`).
- Styling: CSS in `<style>` blocks compiled to WinUI Styles, with opt-in
  `transform`, `focus`, `surface` and `resources` groups.
- Motion: element animation and connected animation.
- State: host state shared with a Tauri, Electron or Node host.
- Tooling: a Vite plugin with hot reload (it compiles with Svelte's own
  compiler; `@sveltejs/vite-plugin-svelte` is no longer a dependency), a test
  loader and a compile hook.
