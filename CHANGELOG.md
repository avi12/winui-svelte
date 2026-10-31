# Changelog

All notable changes to this project are documented in this file
The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project adheres to [Semantic Versioning](https://semver.org/)

## [Unreleased]

### Changed

- Breaking: event props are the WinUI event name in lowercase, like the DOM's
  (`ontoggled`, `onselectionchanged`, `ondraw`, `onclosed`), not `onToggled`;
  the camel-case spelling is an unknown prop and fails `svelte-check`
  Props keep WinUI's lowerCamelCase (`isOn`)

### Added

- Web APIs (`winui-svelte/web-apis`): opt-in installers that define the
  standard Web APIs over WinRT and Win32, a `runWindow` `webApis` option,
  `navigator.permissions`, and `Notification` over app notifications with
  WinUI extras (buttons, inputs, progress, scenario, sound and more)
  (`winui-svelte/web-apis/notification`)
- Web APIs for the page, timing, observers and animations: `document.visibilityState`,
  the Fullscreen API and window events (`/web-apis/page`), `requestAnimationFrame`
  and `requestIdleCallback` (`/web-apis/timing`), `ResizeObserver`,
  `IntersectionObserver` and `MutationObserver` (`/web-apis/observers`), and
  `element.animate()` with `Animation` and `KeyframeEffect`
  (`/web-apis/animations`); element animations now pause, seek, reverse and
  honour delay, iterations, direction, easing and fill

- Components: every WinUI 3 control as a Svelte 5 component, generated from
  WinUI's metadata, with typed props, events and `bind:` support
- Renderer: a tree that Svelte draws into as if it were the DOM, creating and
  updating WinUI controls, with keyed lists and item hosts
  It runs on a
  published Svelte (peer range `~5.56.7`); no Svelte pull request or build is
  needed
- Window: `runWindow`, `createWindow`, window chrome, backdrops, pickers,
  timers and live system settings
- App: single-instance handling over a per-user named pipe, so a later copy's
  arguments and working directory reach the first copy even from `node.exe`,
  and app notifications (`winui-svelte/app`)
- Tray: a notification-area icon (`winui-svelte/tray`): `TrayIcon`,
  `createTrayIcon`, click, double click, middle click and right click with the
  pointer's position, balloons, a light and dark taskbar icon, `guid`, and
  `hideToTray` / `restoreFromTray` for a window, and a `menu` snippet whose
  flyout opens at the pointer from a one-pixel window
- Devices: Windows device APIs as runes and typed functions
  (`winui-svelte/devices`): `deviceWatcher` and `findAllDevices`, input
  devices, Bluetooth LE scanning and GATT, radios, printers, battery, network,
  displays, audio endpoints, gamepads and sensors; each area is an opt-in
  subpath
- Styling: CSS in `<style>` blocks compiled to WinUI Styles, with opt-in
  `transform`, `focus`, `surface` and `resources` groups
- Motion: element animation and connected animation
- State: host state shared with a Tauri, Electron or Node host
- Win2D (`winui-svelte/win2d`, opt-in): the Win2D controls as components, a
  `Canvas` you draw on with a reactive function, drawing, resource and effect
  helpers, and `applyEffect` to put a Win2D effect on an element through
  Composition
  Its NuGet package is restored by `winapp.yaml`
- Canvas 2D (`winui-svelte/win2d/context-2d`, opt-in): the HTML Canvas 2D API
  over Win2D (`Context2D`, `Path2D`, gradients, patterns, `ImageData`, text,
  shadows, compositing, clipping), a `CanvasElement` that stands in for an HTML
  canvas (`createCanvas2D` off screen, or the `Canvas2D` component with the
  control's pointer events), so a drawing library written for a browser canvas
  draws on it
- Tooling: a Vite plugin with hot reload (it compiles with Svelte's own
  compiler; `@sveltejs/vite-plugin-svelte` is no longer a dependency), a test
  loader and a compile hook
