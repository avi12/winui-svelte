# winui-svelte

[![npm version](https://img.shields.io/npm/v/winui-svelte)](https://www.npmjs.com/package/winui-svelte)

WinUI 3 controls as Svelte components: native Windows apps written in Svelte,
the way React Native writes native apps in React
Every control is WinUI's own,
so the app looks and behaves like Windows: light and dark follow Windows, the
controls animate and are accessible as WinUI makes them, and acrylic is a real
backdrop
No browser engine is involved; there is no DOM

## Using it, at a glance

Everything an app needs, in the order a new project hits it
Each point links to the section with the detail, and [API.md](https://github.com/avi12/winui-svelte/blob/main/API.md) has every
signature

- **Setup:** `pnpm add winui-svelte`, one `winuiSvelte()` plugin in
  `vite.config.ts`, and `winuiDiagnostics()` in `svelte.config.js` so scoped
  classes on components do not warn ([Quick start](#quick-start))
- **Components:** import them in PascalCase from `winui-svelte/components`
  (`StackPanel`, `TextBlock`, `ToggleSwitch`); every WinUI 3 control exists, so
  find yours in the [Controls](#controls) section's
  [table](https://github.com/avi12/winui-svelte/blob/main/API.md#controls-winui-sveltecomponents) and follow its
  link to the WinUI docs
- **Closed sets of values** (alignment, orientation, wrapping...) are enums from
  `winui-svelte/enums`, never string literals
- **Text** is the child of the component: `<TextBlock>Hello</TextBlock>`
- **Props** are WinUI's own property names in `lowerCamelCase`; a wrong prop or a
  wrong value type fails `svelte-check`, so run it after every change
- **Events** mirror the DOM and are all lowercase: `onclick`, `ontoggled`,
  `onselectionchanged`, never `onClick`
- **Layout and look** are CSS in the component's `<style>`, scoped by Svelte's
  own algorithm, with native units only: `px`, `deg`, `s`, `ms`, `fr`, `auto`
  and plain numbers, never `%` or `rem`; a property the styled element lacks
  (`font-size` on a `PathIcon`) is a build error at the rule, not a failure when
  the window opens ([Styling with CSS](#styling-with-css))
- **State** shared with the host goes through `winui-svelte/state`
  (`hostState`, `send`); the host and the window talk in JSON lines
  ([State](#state), [Host integration](#host-integration))
- **Web APIs** (`Notification`, `navigator.geolocation`, the clipboard and the
  rest) are the browser's own, backed by Windows; call them as on the web
  ([Web APIs](#web-apis))
- **Errors** thrown in an event handler or a prop are caught on the UI thread,
  written to stderr with their stack and handed to `runWindow({ onerror })`;
  the app goes on ([API.md](https://github.com/avi12/winui-svelte/blob/main/API.md))
- **Shipping:** `buildApp` from `winui-svelte/vite` builds one file per entry
  that plain Node runs; minify is off unless you pass `isMinified: true`, and
  stays off for an app that draws with Win2D ([Production build](#production-build));
  a tray app starts hidden with `<Window isHidden>`, which never shows the window
- **Testing:** run a window test on a hidden desktop where you can; never inject
  real mouse or keyboard input
- **Not a browser:** there is no DOM, no `document`, no `%` layout; anything in
  [Limitations](#limitations) is a known gap, so check it before working around
  an error

## Why

When you make a C# app that uses WinUI 3, every little change to the code or UI requires recompilation and relaunch, which really disrupts the flow in my opinion

Then I stumbled upon [node-winui](https://github.com/microsoft/winappCli/blob/main/samples/node-winui) and I thought that it would be cool to use the power of Svelte's ergonomics and ease of use as well as Vite's HMR to dynamically update the UI, and the result is this npm module

```svelte
<script lang="ts">
  import { StackPanel, TextBlock, ToggleSwitch } from "winui-svelte/components";

  let isOn = $state(true);
</script>

<StackPanel class="page">
  <TextBlock class="title">Hello from WinUI</TextBlock>
  <ToggleSwitch bind:isOn header="Lights" />
</StackPanel>

<style>
  .page {
    gap: 12px;
    padding: 24px;
  }

  .title {
    font-size: 24px;
  }
</style>
```

Layout and look are CSS: `padding`, `gap` (WinUI's `Spacing`), `margin`,
`font-size` and the rest go in the `<style>` block; the components keep the
matching props (`padding`, `spacing`, `fontSize`) for values that change at run time

- **Every WinUI 3 control, and the value objects they take** (brushes,
  transforms, animations, layouts...: 295 components in the table) are
  generated from WinUI's own metadata, with typed props, typed events and
  `bind:`-able properties
  The package follows WinUI instead of a hand-picked
  subset; lists (`ListView`, `GridView`...) are generated too
- **Svelte's own compiler and runtime**, a published release (the package
  draws into a small DOM it provides)
  Runes, context, `{#if}`, `{#each}`, snippets, `svelte/reactivity` and stores
  work as they do on the web
- **Hot reload** while you develop: save a `.svelte` file and the open window
  changes in place
- **Framework-agnostic.** The window runs in a Node process (with a worker for
  WinUI's UI thread) that something else starts: a Tauri core, an Electron
  main process, or you from a terminal
  The host and the window talk in JSON
  lines (or a `MessagePort` in-process)
- **Windows only.** Windows 10 version 1809 (build 17763) and Windows 11, on
  the Windows App SDK (WinUI 3) through
  [dynwinrt](https://github.com/microsoft/dynwinrt)

Built for [Edge+](https://github.com/avi12/edge-plus), whose settings panel is
written with it

> **Status: pre-release.** What is described here is what the repository's
> tests and the [hello example](https://github.com/avi12/winui-svelte/tree/main/examples/hello) run

## Requirements

| | |
| --- | --- |
| OS | Windows 10 1809 (17763) or newer, Windows 11 |
| Node | 24 or newer |
| Windows App SDK runtime | 2.2, installed on the machine. A missing runtime makes `initWindowsAppSdk` throw `WindowsAppRuntimeMissing`; the package does not install it (your app ships the installer and offers it) |
| Svelte | 5.51.1 to 5.57.3 (the peer range `5.51.1 - 5.57.3` is what `pnpm check:svelte-matrix` proves; the package edits a few spots of Svelte's runtime and says so, naming the file and the release, when one no longer matches) |
| Vite | 8 (for the dev server and hot reload) |

## Install

```sh
pnpm add winui-svelte
```

The WinUI bindings, the Windows App SDK bootstrapper and the Vite plugin come
with it

## Quick start

The files below are the [hello example](https://github.com/avi12/winui-svelte/tree/main/examples/hello), run for real by
`examples/hello/run.ps1` (it flips the switch through UI Automation and edits
`App.svelte` to check hot reload)

`vite.config.ts` is one line of plugin:

<!-- hello/vite.config.ts:start -->

```ts
import { defineConfig } from "vite";
import { winuiSvelte } from "winui-svelte/vite";

export default defineConfig({
  plugins: [winuiSvelte()]
});
```

<!-- hello/vite.config.ts:end -->

`App.svelte` is the window's content
`bind:isOn` works on the component like
any Svelte binding:

<!-- hello/App.svelte:start -->

```svelte
<script lang="ts">
  import { StackPanel, TextBlock, ToggleSwitch } from "winui-svelte/components";

  let isOn = $state(true);
</script>

<StackPanel class="hello">
  <TextBlock class="title">Hello from WinUI</TextBlock>
  <ToggleSwitch header="Lights" bind:isOn />
  <TextBlock>
    {#if isOn}
      The lights are on
    {:else}
      The lights are off
    {/if}
  </TextBlock>
</StackPanel>

<style>
  .hello {
    gap: 12px;
    padding: 24px;
  }

  .title {
    font-size: 24px;
  }
</style>
```

<!-- hello/App.svelte:end -->

`window.ts` runs on the UI thread
`runOnUiThread` (the package's `/thread` entry) is a worker's first call: it
enters the apartment before anything creates a WinRT object
The
window's modules come from the host's dev server through the module runner, and
a timer takes the server's hot updates in (the thread's libuv turns between
WinUI's messages, so `fs`, sockets, `fetch`, `WebSocket` and worker messages
all complete there too; see [Timers and I/O](https://github.com/avi12/winui-svelte/blob/main/API.md#timers-and-io)):

<!-- hello/window.ts:start -->

```ts
import { MessagePort, workerData } from "node:worker_threads";
import { createWindowModuleRunner } from "winui-svelte/runner";
import { runOnUiThread } from "winui-svelte/thread";
import type * as WindowModule from "winui-svelte/window";
import { z } from "zod";

// The window: WinUI's thread. Its modules come from the host's dev server, and
// the server's hot updates arrive as messages the window's loop delivers.

const windowSize = {
  width: 480,
  height: 320
};

const workerDataSchema = z.object({ modules: z.instanceof(MessagePort) });

await runOnUiThread(async () => {
  const parsedData = workerDataSchema.safeParse(workerData);
  if (!parsedData.success) {
    throw new Error("the host passed no port to its dev server");
  }

  // Everything goes through the runner, so the window and the components
  // share one renderer.
  const { runner } = createWindowModuleRunner(parsedData.data.modules);
  const { createWindow, runWindow } = await runner.import<typeof WindowModule>("winui-svelte/window");
  const { default: appComponent } = await runner.import("/App.svelte");
  await runWindow({
    onStart() {
      createWindow({
        component: appComponent,
        props: {},
        title: "Hello",
        size: windowSize,
        // Set for an unattended run: the window opens without taking focus.
        isBackground: process.env["WINUI_SVELTE_BACKGROUND"] === "1"
      });
    }
  });
});
```

<!-- hello/window.ts:end -->

`main.ts` is the host: it starts the Windows App SDK, the dev server and the
window:

<!-- hello/main.ts:start -->

```ts
import path from "node:path";
import { MessageChannel, Worker } from "node:worker_threads";
import { initWindowsAppSdk } from "winui-svelte/bootstrap";
import { startModuleServer } from "winui-svelte/vite";

// The host: it starts the Windows App SDK, serves the window's modules from a
// Vite dev server (so a saved .svelte file updates the open window) and starts
// the window, which runs on a worker because WinUI keeps its thread.
//
//   node main.ts

initWindowsAppSdk();

const modules = new MessageChannel();
await startModuleServer({
  root: import.meta.dirname,
  configFile: path.join(import.meta.dirname, "vite.config.ts"),
  port: modules.port1
});
const worker = new Worker(new URL("./window.ts", import.meta.url), {
  workerData: {
    modules: modules.port2
  },
  transferList: [modules.port2]
});
worker.on("error", error => {
  process.stderr.write(`${error.stack ?? String(error)}\n`);
  process.exitCode = 1;
});
worker.on("exit", code => {
  process.exit(process.exitCode ?? code);
});
```

<!-- hello/main.ts:end -->

```sh
node main.ts
```

Edit the text in `App.svelte` and save: the window follows within a moment
Set `WINUI_SVELTE_BACKGROUND=1` to open the window without taking focus (for
scripts and captures)

State changes need no `flushSync`: the window's loop hands each WinUI message
to its handler with no JavaScript under it, so Node drains microtasks after
each one and Svelte's own flush runs
([experiment](https://github.com/avi12/winui-svelte/blob/main/examples/scheduling/README.md))

## Production build

The Quick start serves the window's modules from a Vite dev server, so Vite and
Svelte's compiler run at every start
A shipped app runs on plain Node from files built ahead of time:
`buildApp` (from `winui-svelte/vite`) compiles the components and the
package's own rune modules, bundles Svelte's browser runtime and the
package, and writes one self-contained file per entry

```ts
import path from "node:path";
import { buildApp } from "winui-svelte/vite";

await buildApp({
  root: import.meta.dirname,
  entries: {
    main: path.join(import.meta.dirname, "main.ts"),
    window: path.join(import.meta.dirname, "window.ts")
  },
  outDirectory: path.join(import.meta.dirname, "dist-app")
});
```

```sh
node dist-app/main.js
```

- The entries are the host's main thread and the UI thread's worker file; each
  is a file of its own because the two are separate JavaScript realms
  The host starts the worker from the built file next to it:
  `new Worker(path.join(import.meta.dirname, "window.js"))`
- In the built `window.ts` the app's modules are plain imports
  (`await import("./App.svelte")` inside `runOnUiThread`, after the apartment
  is entered); there is no module runner and no timer for hot updates
- The output folder is self-contained: `buildApp` writes beside the bundles
  what the app reads at run time, so `node dist-app/main.js` needs no
  `node_modules`, no copy of this package and no `@microsoft/dynwinrt` in your
  own dependencies; copy the whole folder to ship, and build on the
  architecture you ship for; a file that is not there is an error that names it
  - `node_modules/@microsoft/dynwinrt`: the native module, its JavaScript and
    the `.node` file of the architecture that builds, with `vcruntime140.dll`
    beside it
  - `bin/<arch>`: the Windows App SDK bootstrapper and the libraries WebView2
    and Win2D load by name; `initWindowsAppSdk()` finds them with no argument
  - `css/winui-resources.g.json`: the catalogue every `resources` prop reads
- `isMinified: true` is safe for the controls (a control is known by the tag
  it was registered under, not by its class name); leave it off for an app
  that draws with Win2D, whose overloads are found by parameter name, or
  that places a control with the raw `<host>` tag, which takes its type from
  the class's own name
- Minify is off by default because of what the saving costs: the production
  example's `window.js` is 20.7 MB plain and 10.8 MB minified, but removing
  whitespace and dead code without renaming leaves 17.5 MB, so the saving is
  the renaming, and renaming is what breaks a Win2D overload (found by the
  names of its parameters in the bindings' source) and the raw `<host>` tag
  (typed by the class's own name); an app that uses neither can turn it on
- A tray app that starts with no window uses `<Window isHidden>`: the window
  is created and never shown (the first show honors the prop), so there is no
  flash to hide afterwards; show it later with `restoreFromTray(handle)`, and
  hide it again with `hideToTray(handle)`
- `config` is merged over the Vite settings, for an `alias` or a plugin of
  your own

[`examples/production`](examples/production) is a host and a window built
this way, and `test/production-build.test.ts` builds it, plain and minified,
and runs it on a hidden desktop

## Web APIs

Features beyond the controls come through the web's own APIs, wired to
WinRT and Win32, so web libraries and web knowledge work unchanged:
`Notification`, `navigator.permissions`, geolocation, the clipboard, media
devices, Bluetooth and the rest of [the table of every API](https://github.com/avi12/winui-svelte/blob/main/API.md#every-api-and-its-subpath); nothing is a bespoke API
Each API is opt-in and installed by an explicit call, on the thread your
app's code runs on (the window thread); an app that imports none pays nothing

```ts
import { runWindow } from "winui-svelte/window";
import { installPermissions } from "winui-svelte/web-apis";
import { installNotification } from "winui-svelte/web-apis/notification";

await runWindow({
  webApis: [
    installPermissions,
    () => installNotification({
      identity: { displayName: "Notes", iconPath: "C:\\notes\\icon.png" },
      appUserModelId: "dev.example.notes"
    })
  ],
  onStart() {
    // Notification and navigator.permissions exist from here on
  }
});

if (await Notification.requestPermission() === "granted") {
  new Notification("Saved", { body: "note.txt", tag: "save" });
}
```

Feature detection is the browser's: `"Notification" in globalThis` is false
until installed, and an API the OS cannot back is simply not defined
Where Windows refuses (an unpackaged app without an identity, notifications
switched off), the API reports `denied` or rejects with the spec's own error
(`NotAllowedError`, `NotSupportedError`)

Every feature is one of three kinds: **web** (the spec, byte for byte), **web plus extras** (the spec, and optional lowerCamelCase members for what WinRT adds) or **as is** (no Web API exists, so the WinRT class itself, one import away)
[API.md](https://github.com/avi12/winui-svelte/blob/main/API.md#web-apis-winui-svelteweb-apis) has the kinds in full, and [the table of every API](https://github.com/avi12/winui-svelte/blob/main/API.md#every-api-and-its-subpath) its subpath, kind and the identity it needs

## Host integration

The window is a process (or a worker) that something else owns
What the host
sends and receives is the same everywhere: JSON values, one per line on stdio,
or the same objects through a `MessagePort`
State the host owns reaches the
window as one deeply reactive object, and the window answers with actions; see
[`src/state/README.md`](https://github.com/avi12/winui-svelte/blob/main/src/state/README.md) for the wire protocol, `hostState`
and `send`

[API.md](https://github.com/avi12/winui-svelte/blob/main/API.md#hosts-tauri-electron-and-node) has the Tauri, Electron and Node hosts in full (the Rust core's sidecar, `utilityProcess`, `diff()` over a `MessagePort`)

## Controls

Every concrete WinUI 3 control, and every value object a property can take, is
a component in `winui-svelte/components`
A component has the properties of its
WinUI class and of every class it inherits from, as camelCase props (`isOn`,
`horizontalAlignment`), its events as `on...` props named like the DOM's, in
lowercase (`ontoggled`, `onselectionchanged`), and `bind:`
on a property that has a matching change event

[The table of every component](https://github.com/avi12/winui-svelte/blob/main/API.md#controls-winui-sveltecomponents) lists what each class adds, which props bind, whether it takes children, and links to its WinUI docs

A property that holds a control or a value object is a snippet prop, so markup
fills it the way XAML does
A brush, geometry, transform, transition,
animation, layout, command, keyboard accelerator, backdrop, icon or image
source, shadow or projection is a component, and the snippet it is written in
names the property:

```svelte
<Border>
  {#snippet background()}
    <LinearGradientBrush>
      <GradientStop color="#00e5ff" offset={0} />
      <GradientStop color="#06182b" offset={1} />
    </LinearGradientBrush>
  {/snippet}
</Border>
```

[API.md](https://github.com/avi12/winui-svelte/blob/main/API.md#writing-values-and-content-winui-sveltecomponents) has how each kind of value is written (enums, thickness, brushes, times, dates, points, images, attached properties and `ref`), the transitions an element plays, items, pages, `WebView2`, Win2D and the raw elements

## Forms

`winui-svelte/forms` submits a group of controls the way an HTML form does
(opt-in; an app that does not import it does not bundle it)

```svelte
<script lang="ts">
  import { TextBox, NumberBox, Button } from "winui-svelte/components";
  import { Form, FormField, textField, numberField, formButton } from "winui-svelte/forms";
  import { z } from "zod";

  const schema = z.object({ email: z.email(), age: z.number().min(18) });
</script>

<Form {schema} onsubmit={({ data }) => save(data)}>
  <FormField field="email" label="E-mail">
    <TextBox {@attach textField({ name: "email", required: true, type: "email" })} />
  </FormField>
  <FormField field="age" label="Age">
    <NumberBox {@attach numberField({ name: "age", required: true, min: 18 })} />
  </FormField>
  <Button {@attach formButton()}>Sign up</Button>
</Form>
```

Each control joins by an attachment named for its kind (`textField`, `numberField`, `selectField` and the rest), with HTML's constraint validation and a zod `schema`
[API.md](https://github.com/avi12/winui-svelte/blob/main/API.md#forms-winui-svelteforms) has the attachments, `FormHandle` and how a form behaves; `examples/form` is the working example (`test/forms.test.ts` fills it in
through UI Automation and reads back the errors and the submitted data); the
gallery's Form submission page shows it

## Media

<details>
<summary>Image sources, the <code>media</code> helpers and the media player</summary>

`Image`, `ImageBrush`, `ImageIcon`, `PathIcon`, `MediaPlayerElement` and
`MediaTransportControls` keep WinUI's names, properties and events
An image `source` is a URI, a file path, the bytes of a file, an
`SvgImageSource`, or a snippet holding `<BitmapImage>` or `<SvgImageSource>`,
as XAML writes `<Image.Source>`
`winui-svelte/media` is opt-in and adds `bitmapImageOf` and `svgImageSourceOf`
(decode options, SVG markup, `data:` URIs, bytes), and `createMediaPlayer`, a
real `MediaPlayer` with no window for audio, with its position, duration and
state as runes
SVG is an `SvgImageSource` in an `Image`, `ImageBrush` or `ImageIcon` (static
SVG: no scripts, no animation, limited CSS), or a path string in `PathIcon`;
`BitmapIcon` with `showAsMonochrome` takes its colour from `foreground`
[API.md](https://github.com/avi12/winui-svelte/blob/main/API.md#media-winui-sveltemedia) has the formats WinUI decodes and the
details, and `examples/media-elements` the example

</details>

## Windows devices

Windows' own device APIs, kept under their Windows names and made reactive: a
`DeviceWatcher` that fills an `{#each}`, the mouse and keyboard Windows
sees, Bluetooth LE scanning and GATT, printers with their state, the battery,
the network, displays, audio endpoints, gamepads and sensors
Each area is an opt-in import (`winui-svelte/devices/enumeration`, `/power`, `/printers` and the rest), and works from `node.exe` with no package
identity

Every list is a keyed collection, every value a getter that re-runs when
Windows says it changed, and every watcher stops with its component
What does not work unpackaged (`MouseDevice`, the print dialog of
`PrintManager`, geolocation), the failure modes and an example for each area
are in
[`API.md`](https://github.com/avi12/winui-svelte/blob/main/API.md#windows-devices-winui-sveltedevices)

## Styling with CSS

`<style>` blocks are translated at build time into WinUI `Style`s and applied
by class, so a card is `class="card"` and a rule, as on the web
Layout
properties map onto WinUI's panels
A declaration with no WinUI meaning is a
build error with its file and line; nothing is silently ignored
[`src/css/API.md`](https://github.com/avi12/winui-svelte/blob/main/src/css/API.md) is the interface; what maps is in the table below:

<details>
<summary>What maps to what</summary>

| CSS | WinUI |
| --- | --- |
| `margin`, `padding`, `border-width`, `border-color`, `border-radius` | `Margin`, `Padding`, `BorderThickness`, `BorderBrush`, `CornerRadius` |
| `color`, `background-color`, `opacity` | `Foreground`, `Background`, `Opacity` |
| `background-image` or `background` with `linear-gradient()` or `radial-gradient()` | a `LinearGradientBrush` or `RadialGradientBrush` Background (a sheet that uses one carries the parser; one that does not, does not) |
| `width`, `height`, `min-*`, `max-*` | `Width`, `Height`, `MinWidth`... |
| `font-size`, `font-weight`, `font-family`, `font-style`, `line-height`, `letter-spacing`, `text-align`, `text-wrap`, `text-overflow`, `text-decoration` | the `TextBlock` and `Control` font and text properties |
| `font-stretch`, `direction`, `background-clip`, `tab-index` | `FontStretch` (`ultra-condensed` to `ultra-expanded`), `FlowDirection` (`ltr`, `rtl`), `BackgroundSizing` (`border-box` is `OuterBorderEdge`, `padding-box` is `InnerBorderEdge`), `TabIndex` (a negative value sets `IsTabStop` to false) |
| `gap`, `row-gap`, `column-gap` | `Spacing` (a stack), `RowSpacing` and `ColumnSpacing` (a grid) |
| `flex-direction`, `display: flex` on a stack, `align-self`, `justify-self` | `Orientation`, `VerticalAlignment`, `HorizontalAlignment` |
| `grid-template-columns`, `grid-template-rows` (`fr`, `px`, `auto`, `minmax()`, `fit-content()`, `repeat(n, ...)`), `grid-column`, `grid-row` | `ColumnDefinitions`, `RowDefinitions`, `Grid.Column`... |
| `display: none`, `visibility`, `pointer-events`, `z-index`, `overflow` | `Visibility`, `IsHitTestVisible`, `Canvas.ZIndex`, the scroll bar visibilities |
| `outline`, `outline-offset` | the focus visual: `FocusVisualPrimaryBrush`, `FocusVisualPrimaryThickness`, `FocusVisualMargin` |
| `animation`, `@keyframes` | `Storyboard`s of key frames (opacity, size, colors, translate, scale, rotate, transform, and every keyword property such as `font-style` or `text-align`, which steps at the middle of an interval; `display` and `visibility` hold the visible value instead: a hide lands at the end of the animation and a show at its start), begun with the class |
| `box-shadow`, `aspect-ratio`, `user-select`, `object-fit`, `line-clamp`, `word-break` | a `ThemeShadow` of the blur's depth, a Height that follows the Width, `IsTextSelectionEnabled`, `Stretch`, `MaxLines`, `TextWrapping` |
| `-winui-elevation` | a `ThemeShadow` lifted by its depth |
| `filter`, `backdrop-filter`, `mix-blend-mode`, `mask-image` | an effect graph of Win2D effects (Gaussian blur, colour matrix, blend, alpha mask) that the element's Composition visual is drawn through; `backdrop-filter` samples a real backdrop brush |
| `clip-path`: `inset()` (with `round`), `circle()`, `ellipse()`, `polygon()`, `path()` | a `CompositionGeometricClip` on the element's visual |
| `translate`, `scale`, `rotate`, `transform-origin`, `transition`; `transform` (translate, scale, rotate, skew, matrix) | the UIElement transforms, their pivot (`CenterPoint`, 50% 50% as in CSS) and their implicit transitions; `transition` also runs a Storyboard for `width`, `height`, `min-` and `max-` sizes, `font-size`, `color` and `border-color` between values written out, and `allow-discrete` steps any keyword property: `display 200ms allow-discrete` keeps a hidden element shown until the transition ends, `text-align 200ms allow-discrete` changes it at the middle |
| `var(--card-background-fill-color-default)` | `{ThemeResource CardBackgroundFillColorDefault}`: WinUI's own resources, so light and dark follow Windows |
| `--name: value` on `:root`, or on a class | an app-wide resource, or one only the elements with that class (and their templates) see: `.danger { --button-background-pointer-over: red }` |
| `.class`, `type`, `:hover`, `:focus`, `:active`, `:root`, `:where()` | class and type matching, the control's events, custom properties |

</details>

A length is written in the units WinUI has: px, and deg, s, ms, fr, auto and
unitless numbers where a property takes them; `padding: 8px`, `gap: 8px`,
`font-size: 20px`
Any other unit (`rem`, `em`, `pt`, `vw`, `cqw`, a percentage length and so on)
is a compile error from both the compiler and stylelint, with the message
saying what to write
A class that sets a property its element lacks (`font-size` on a `PathIcon`)
is an error too, in the build and the editor, at the rule and naming the element
that uses it, instead of a failure when the window opens
The table of every unit is in [`src/css/API.md`](https://github.com/avi12/winui-svelte/blob/main/src/css/API.md#length-units)

### Scoping

A rule in a component's `<style>` reaches only the elements and the component
instances that component writes, as in Svelte: `.title` styles `<TextBlock
class="title">` in that file, and a `.title` in another component does not
collide with it
No `:global` is needed for that
The scope is added at build time (the scope class is part of the `class` value
the instance receives), so the window pays nothing for it at run time
`:global(.x)` and `:global { }` escape the scope, as in Svelte
A class given to a `*Style` prop reaches the rules of the component that
writes the prop (see Templates, styles and resources below)
A class the parent scopes does not reach the elements inside a child component;
a child that takes a `class` prop and puts it on its own root element receives
the scope class with the value (an array or an object works, as `clsx` does)

The editor and `svelte-check` run Svelte's plain compiler, which cannot see a
component instance and warns `css_unused_selector` for `.title`
`winuiSvelte()` already tells the editor otherwise; a project with no Vite
config (or one that does not use the plugin) puts the same two hooks in
`svelte.config.js`:

```js
import { winuiDiagnostics } from "winui-svelte/preprocess";

const winui = winuiDiagnostics();

export default {
  preprocess: [winui.preprocess],
  compilerOptions: {
    warningFilter: winui.warningFilter
  }
};
```

A rule that matches no element and no instance still warns

Style in CSS, as in the web: a class on the instance (`<Border class="card">`)
and a rule in the scoped `<style>`
A prop and a rule that set the same WinUI property both work, and the prop
wins: `<TextBlock isTextSelectionEnabled={false}>` stays false under
`user-select: text`, and a rule fills in where the prop is absent
(`padding`, `gap` and `font-size` the same)
This is the reverse of the web's presentation attributes, on purpose: the prop
is the direct, local value
An animation still overrides a local value while it runs, as on the web

`style:` and `class:` directives work on component instances too
`<TextBlock style:padding="{padding}px" class:active={isActive}>` is rewritten
at build time into a `style` string and a `class` array that stay reactive;
`null`, `undefined` and `false` leave a declaration out
As they are CSS, an explicit prop wins over them as well

## Templates, styles and resources

<details>
<summary>Templates, <code>*Style</code> props, resources and <code>goToState</code></summary>

Props typed with a WinUI template take XAML text, so a control is restyled
without leaving Svelte; a `*Style` prop takes the CSS classes whose rules make
its Style; `resources` takes a record of theme keys
WinUI's own objects are
accepted too, and `xamlOf` loads text once for several props

```svelte
<script lang="ts">
  import { Button, ComboBox, goToState } from "winui-svelte/components";
</script>

<Button
  template="<ControlTemplate TargetType='Button'><Border Background='Teal'>
    <ContentPresenter/></Border></ControlTemplate>"
  resources={{ "--button-background-pointer-over": "#c42b1c", "--button-padding": 12 }}>
  Save
</Button>

<ComboBox itemContainerStyle="row" headerTemplate="<DataTemplate>
  <TextBlock Text='{Binding}'/></DataTemplate>" />

<style>
  .row { padding: 8px; background-color: #123456 }
</style>
```

`itemContainerStyle="row"` names a class and no element of the component;
the build adds the component's scope class to the value (text, an expression
or a conditional), so `.row` in the same `<style>` styles it, scoped, and a
`.row` in another component does not collide with it; `:global(.row)` works too
A root element without `xmlns` gets WinUI's, and the wrong
root for the prop (a `DataTemplate` for `template`) is an error that names both
A key of `resources` is a custom property's name, as in a stylesheet, or the
resource's own (`ButtonBackground`); a color or length keeps the kind its key
has in WinUI (`ButtonBackground` is a brush, `ButtonPadding` a thickness)
`goToState({ control, name })` enters a state the control's template defines
[API.md](https://github.com/avi12/winui-svelte/blob/main/API.md) has the rest: what each `*Style` prop styles, `xamlOf`, and
what is not covered

</details>

## Transitions

<details>
<summary>Svelte's transitions on raw elements</summary>

Svelte's own `transition:`, `in:`, `out:` and `animate:` work on the raw
elements of a component (`<border>`, `<text-block>`), with the functions of
`svelte/transition` (`fade`, `fly`, `slide`, `scale`, `draw`, `crossfade`;
`blur` blurs the element for real), `svelte/animate` (`flip`) and `svelte/motion`
(`Tween`, `Spring`):

```svelte
<script lang="ts">
  import { fly } from "svelte/transition";
</script>

{#if isShown}
  <border class="card" transition:fly={{ y: 40, duration: 300 }}>
    <text-block>Hello</text-block>
  </border>
{/if}

<style>
  .card {
    padding: 16px;
  }
</style>
```

The Vite plugin turns the support on in each component that uses a directive or
imports one of those modules; an app that uses none does not bundle any of it
`onintrostart`, `onintroend`, `onoutrostart` and `onoutroend` work on any
element, `|local` and `|global` as in Svelte, and `mountControl({ component,
props, intro: false })` keeps the global `in:` and `transition:` directives
from playing on the first render (they play by default, as in Svelte)
The animation moves the control's `Opacity`, `Translation`, `Scale`,
`Rotation`, size, margin, padding, border and a shape's stroke dashes
See
[API.md](https://github.com/avi12/winui-svelte/blob/main/API.md) for the details and what WinUI cannot do

</details>

## Accessibility and theming

The library follows the user's Windows settings with no setup
The theme is the system's (a window's `theme` is `system` unless you say `light`
or `dark`), high contrast applies WinUI's contrast themes and system colors,
and reduced motion switches off CSS transitions and animations and Svelte's
transitions
In a stylesheet the web's media queries read these settings:

```css
@media (prefers-color-scheme: dark) { .card { background-color: #202020 } }
@media (forced-colors: active) { .card { background-color: Canvas; color: CanvasText } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none } }
@media (prefers-reduced-transparency: reduce) { .panel { background-color: Canvas } }
```

and in script `mediaQuery("(prefers-reduced-motion: reduce)").matches` is a
reactive boolean, `systemSettings()` has `isDarkTheme`, `isHighContrast`,
`isAnimationEnabled`, `isTransparencyEnabled` and `textScaleFactor`, and
`installMatchMedia()` gives libraries the web's `matchMedia`
See [API.md](https://github.com/avi12/winui-svelte/blob/main/API.md) and [src/css/API.md](https://github.com/avi12/winui-svelte/blob/main/src/css/API.md) for every media
feature and what each one is answered from

## State

Svelte's own state tools work unchanged (runes, context, `SvelteMap`, stores)
`examples/stores` runs them in a real window (`test/stores.test.ts` drives it
and reads the controls back): `writable`, `readable`, `derived`, a custom store
and `get`, the `$store` read and `$store = value` write, a store passed as a
prop or through context, `bind:text`, `bind:value` and `bind:isOn` into a
store, a store behind `{#each}` and `{#if}`, a store unsubscribed when its
component is destroyed, `Tween`, `Spring` and the older `tweened` and `spring`
stores from `svelte/motion`, and `SvelteMap`, `SvelteSet`, `SvelteDate`,
`createSubscriber` and `MediaQuery` from `svelte/reactivity`
`src/renderer/testing/stores.test.ts` checks the same store syntax in plain
Node, on the DOM shim
Two things to know: a `readable` that ticks starts its timer with
`startTimer` from `winui-svelte/window`, because Node's `setInterval` never
fires on the UI thread, and `MediaQuery` needs `installMatchMedia()` first
The package adds `winui-svelte/state`: `createHostChannel({ transport })`,
`hostState<View>({ channel, name: "view" })` and `channel.send(action)`, for state a Tauri
core, an Electron main process or a script owns
A host written in JavaScript
imports `winui-svelte/state/host` (`diff`, the transports, the message types),
which loads in plain Node
[`src/state/README.md`](https://github.com/avi12/winui-svelte/blob/main/src/state/README.md) has the
protocol and the tests

## Drag and drop, pickers and the clipboard

`winui-svelte/data-transfer` (opt-in) brings the web's data transfer to WinUI:
the drag events with a `DragEvent` and a `dataTransfer`, files as `NativeFile`
(like the web's `File`, read from the path with Node), an `accept` filter like
`<input accept>`, file and folder dialogs, the clipboard and the launcher
Raw elements take the web names after `enableDragEvents()`; components take the
`dropzone`, `draggable` and `filePicker` attachments, because a component prop
would pull this code into every app

Dragging out (`ondragstart`, `draggable({ files })`), the `drag` event, the
clipboard's HTML, files and pictures, `pickSaveFile`, `revealInExplorer` and the
share pane, with examples of the [attachments](https://github.com/avi12/winui-svelte/blob/main/API.md#attachments-dropzone-draggable-filepicker), are in
[API.md](https://github.com/avi12/winui-svelte/blob/main/API.md#data-transfer-winui-sveltedata-transfer)
Unpackaged apps cannot open the share pane (it needs a package identity) and
get no scheme handler list from the launcher; everything else on this page runs
from `node.exe`

## Entry points

The published package ships `dist/`: the TypeScript compiled with its
declarations, and the Svelte files as source (with `types` and `svelte`
conditions on `exports`), which your Vite compiles (`winuiSvelte()`)

<details>
<summary>Every subpath of the package</summary>

| Specifier | What |
| --- | --- |
| `winui-svelte` | `control`, `withControl`, `mountControl`, `registerControls`, `dispatch` / `flush`, the value helpers |
| `winui-svelte/components` | every control as a component, and its props type; `xamlOf`, `goToState`, `installXaml` |
| `winui-svelte/enums` | every closed set a prop or option takes (`HorizontalAlignment`, `Backdrop`, `ThemeBrush`...), each a value and a type of one name ([`API.md`](https://github.com/avi12/winui-svelte/blob/main/API.md#closed-sets-winui-svelteenums)) |
| `winui-svelte/win2d`, `/win2d/context-2d` | `Canvas` and the Win2D helpers; `createCanvas2D` and `Canvas2D`, a `CanvasRenderingContext2D` over Win2D (both opt-in) |
| `winui-svelte/state` | the window's side of host state |
| `winui-svelte/state/host` | a JavaScript host's side: `diff`, transports, message types |
| `winui-svelte/messaging` | `defineMessaging`: typed request and response messages over a transport, loadable in plain Node |
| `winui-svelte/vite` | `winuiSvelte()` for `vite.config.ts`; `startModuleServer()` for hot reload; `buildApp()` for the production bundle |
| `winui-svelte/runner` | `createWindowModuleRunner()`, the window thread's side of the module server |
| `winui-svelte/window` | `runWindow`, `createWindow`, `startTimer`, `exitApplication`, `systemSettings` |
| `winui-svelte/thread` | `runOnUiThread`, the first call of the UI thread's worker |
| `winui-svelte/bootstrap` | `initWindowsAppSdk`, for the host's main thread |
| `winui-svelte/testing` | Node module hooks that run `.svelte` files from source, for tests |
| `winui-svelte/compile`, `/host`, `/keyed-list` | the compiler hook, the renderer, a keyed collection sync |
| `winui-svelte/element-animation` | `enableElementAnimation` (the Vite plugin calls it for you; Svelte's `transition:` and `animate:` run on WinUI) |
| `winui-svelte/attached-owners` | `preloadAttachedOwners` (the Vite plugin calls it for a component that names `canvasLeft`, `gridRow` and the like, so a placed control has its place at its first layout; a prop named nowhere needs the call by hand) |
| `winui-svelte/element-effects` | `enableElementEffects` (the Vite plugin calls it from a component that imports `blur` or `draw`): the blur transition blurs for real and `draw` measures a `path`, with Composition and Win2D |
| `winui-svelte/app` | single-instance handling over a named pipe, and app notifications |
| `winui-svelte/bindings/*` | Every bound WinRT and Windows App SDK class as it is named there, for the as-is kind (`winui-svelte/bindings/windows/storage/StorageFolder`) |
| `winui-svelte/web-apis`, `/web-apis/notification`, `/web-apis/media-devices`, `/web-apis/speech`, `/web-apis/media-session` | `installWebApis`, `installPermissions` and the Web APIs as opt-in installers: `Notification` over app notifications, media devices, speech and the media session (opt-in; [`API.md`](https://github.com/avi12/winui-svelte/blob/main/API.md#web-apis-winui-svelteweb-apis)) |
| `winui-svelte/data-transfer` | web-shaped drag and drop, `NativeFile`, pickers, the clipboard and the launcher (opt-in) |
| `winui-svelte/media` | `bitmapImageOf`, `svgImageSourceOf`, `createMediaPlayer`: image sources and a windowless `MediaPlayer` (opt-in; [`API.md`](https://github.com/avi12/winui-svelte/blob/main/API.md#media-winui-sveltemedia)) |
| `winui-svelte/tray` | `TrayIcon`, `createTrayIcon`, `hideToTray`: a notification-area icon (opt-in; [`API.md`](https://github.com/avi12/winui-svelte/blob/main/API.md#system-tray-winui-sveltetray)) |
| `winui-svelte/forms` | `Form`, `FormField` and the attachments that join a control to a form by name, with HTML's constraint validation and zod (opt-in; [`API.md`](https://github.com/avi12/winui-svelte/blob/main/API.md#forms-winui-svelteforms)) |
| `winui-svelte/devices`, `/devices/enumeration`, `/devices/input`, `/devices/bluetooth`, `/devices/printers`, `/devices/power`, `/devices/network`, `/devices/audio`, `/devices/display`, `/devices/gamepad`, `/devices/sensors` | device enumeration, input devices, Bluetooth, printers, power, network, displays, audio, gamepads, sensors: Windows' own device APIs as runes (opt-in; [`API.md`](https://github.com/avi12/winui-svelte/blob/main/API.md#windows-devices-winui-sveltedevices)) |
| `winui-svelte/connected-animation` | `connectElement` and `startConnected`, WinUI's connected animation between pages |
| `winui-svelte/css/transform`, `/css/animation`, `/css/effects`, `/css/filter`, `/css/clip`, `/css/focus`, `/css/surface`, `/css/position`, `/css/container`, `/css/queries`, `/css/environment`, `/css/compat`, `/css/resources` | the opt-in CSS groups: 2D transform, animations, aspect ratio, filters and masks, clip shapes, focus visuals, surfaces, position and inset, media and container queries, media preferences and display features, browser-stylesheet properties, theme resources ([`src/css/API.md`](https://github.com/avi12/winui-svelte/blob/main/src/css/API.md)) |
| `winui-svelte/css`, `/css/vite`, `/css/sheet-module`, `/css/gradients`, `/css/stylesheet` | the CSS runtime, its Vite plugin, the sheet module compiler, the gradient parser a sheet with a gradient imports and the type declaration for a `.css` import ([`src/css/API.md`](https://github.com/avi12/winui-svelte/blob/main/src/css/API.md)) |
| `winui-svelte/preprocess`, `winui-svelte/stylelint`, `winui-svelte/vscode-css-data.json` | the editor side of the CSS: a Svelte preprocessor, a stylelint rule and VS Code custom data, all from the same validator and tables, so the editor, the linter and the build say the same thing ([`src/css/API.md`](https://github.com/avi12/winui-svelte/blob/main/src/css/API.md#diagnostics-in-the-editor-the-linter-and-the-build)) |

</details>

### Source maps

<details>
<summary>Source maps in the package and in Node</summary>

Every compiled file ships with its source map, and the TypeScript they point at
is in the package (`node_modules/winui-svelte/src`), so your IDE opens the
implementation instead of the declaration: Go to Definition on a
`.d.ts` lands in the `.ts` (declaration maps), and the debugger and your
bundler's production source maps step through the original code
In a Node
process that runs the compiled files, start Node with `--enable-source-maps` so
stack traces name the TypeScript lines
The dev server maps the components it
compiles for you; a component compiled through `compileSvelte` (tests,
`winui-svelte/compile`) ends with an inline map of its own

</details>

## Size

An app with one `Button` bundles to under the byte budget of the bundle test
(`scripts/pack/treeshake.test.ts`, the one place the number lives; it is
lowered as the package shrinks and never raised, and `pnpm test` fails when the
bundle grows past it), because the package is tree-shakeable: a consumer that
imports `Button` does not bundle `NavigationView`

## Limitations

Stated plainly, so nobody finds them by surprise:

<details>
<summary>Every known gap</summary>

- **Windows only**, and only Windows 10 1809 and newer
  Importing an entry
  point that loads WinRT on another system fails with dynwinrt's "Cannot find
  native binding" error, and `initWindowsAppSdk` throws a plain error naming
  the supported platforms; no entry point does work when imported
  The
  Windows App SDK runtime must be installed; the package does not install it
- **Drag and drop has gaps WinUI leaves.** The `drag` event on a source is
  emulated by a 50 ms timer that reads the cursor (WinUI has none), `setDragImage`
  is accepted but WinUI draws its own preview of the data, `relatedTarget` is
  always null, and a component takes the web names only through the
  `dropzone` and `draggable` attachments (a raw element takes them after
  `enableDragEvents()`)
  The share pane needs a package identity, so `share` throws
  `ShareUnavailableError` from a plain Node.js or Electron process, and the
  clipboard and launcher calls run on the UI thread

- **MediaPlayer events do not reach JavaScript.** `MediaPlayer` raises all of
  its events (`MediaOpened`, `MediaEnded`, `CurrentStateChanged`, ...) on a
  thread of its own, and dynwinrt does not deliver a callback raised on another
  thread
  `createMediaPlayer` keeps a `state` that it reads again every 100 ms on the
  UI thread (`playbackState`, `position`, `naturalDuration`, `isEnded`), which
  is what an app relies on
- **No `WriteableBitmap` component.** A `WriteableBitmap` takes its size when it
  is made, so `writeableBitmapOf({ width, height, pixels })` from
  `winui-svelte/media` makes one from RGBA bytes
- **The tray icon hears the mouse by polling.** WinUI has no tray API, and
  dynwinrt cannot make a JavaScript function a native window procedure, so
  `winui-svelte/tray` reads the pointer and the buttons every 30 ms instead of
  receiving the shell's callback
  Clicks, double clicks, middle clicks and
  right clicks (with their position) work; keyboard activation, touch, and a
  click on a balloon cannot be heard (nothing says which icon has keyboard
  focus, so Enter and Space on it are lost too)
  The `menu` snippet opens its
  flyout from a one-pixel window made on the right click
  A Tauri or Electron
  host that already has a tray should keep using it
- **Base and thin acrylic are controller backdrops.** `acrylicBase` and
  `acrylicThin` put WinUI's `DesktopAcrylicController` behind the window, so
  `window.systemBackdrop` reads null for them (the controller holds the
  material)
- **Svelte is held to the releases checked.** The package reads a few spots of
  Svelte's runtime with edits, so the peer range is the span of releases the
  matrix (`pnpm check:svelte-matrix`) runs the tests against, and it widens
  only after a release passes; 5.51.0 and older do not match an anchor
- **Write an attribute on a raw element in kebab case** (`corner-radius="4"`)
  Svelte's compiler lowercases the names of static attributes, so
  `cornerRadius="4"` reaches the element as `cornerradius`
- **`bind:` works on components, not on raw elements.**
  `<ToggleSwitch bind:isOn>` is supported; `<toggle-switch bind:is-on>` is not
  Use the component, or
  `{@attach control(...)}` and subscribe to the control's event yourself
- **A property whose name starts with "on"** (`ToggleSwitch.OnContent`) is a
  prop on components, but on a raw element Svelte takes the attribute for an
  event: write it as `On-content="On"` or `on-content={() => "On"}`
- **No `:hover` or `:active` miracles on templated controls.** A pseudo-class
  applies a Style when the control reports the event, but WinUI's own template
  states (a Button's pointer-over and pressed brushes) take over from a Style's
  setters while they are active, and a control that handles an event itself (a
  Button handles `PointerPressed`) never reports it, so `:active` does nothing
  there
  Override the control's theme resources instead
- **Transitions on a raw element.** `blur` and `draw` need
  `winui-svelte/element-effects` (the Vite plugin turns it on for a component
  that imports either), and without it `blur` only fades; a directive goes on a
  raw element, and a `<path>` takes a `Geometry` (not path data) for `draw`
- **A leaving element and its panel.** In a keyed `{#each}` with `animate:` the
  siblings of a leaving element flip into place as it leaves when the panel has
  an axis (a `StackPanel`); in a `Grid` or `Canvas` the element keeps its place
  in the layout until it is gone
- **Two controls are not components:** `SwapChainBackgroundPanel` (the UWP
  panel WinUI 3 keeps for compatibility: it refuses Opacity, Width, Height, the
  min and max sizes and Margin, and is allowed only as the application's root
  visual or inside a Page, so it cannot go in a panel;
  `SwapChainPanel` replaces it) and `PivotHeaderItem` (WinUI makes it only
  inside a `Pivot`; style a header with the `header` snippet of `PivotItem`,
  which takes any element)
- **`WebView2` needs an ordinary desktop session.** A process a sandbox or a
  service started cannot launch the browser (error 0x8007139F), and a `data:`
  URL cannot be the top frame
- **Win2D effects on an element are built, not seen.** `applyEffect` puts a
  Win2D effect on an element as a Composition effect brush, but nothing reads
  pixels back from Composition without a screen capture, so only the drawing
  (`Canvas`, render targets) is proved by pixels
  An element cannot be its own
  effect source: its child visual would be part of what it samples
- **Win2D's overloads need the package's helpers.** The bindings pick an
  overload from the argument count and JavaScript types, so
  `session.fillRectangle(x, y, w, h, brush)` calls the Color overload; the
  functions of `winui-svelte/win2d` find the overload by its parameter names
- **CSS is WinUI's subset.** Layout follows the element's type (`src/css/API.md`
  has the table): `display: flex` is a `<stack-panel>`, `display: grid` a
  `<grid>` (tracks in `fr`, `px`, `auto`, `minmax()`), `position: absolute` a
  `<canvas>` child, `@media (min-width...)` restyles as the window resizes, and descendant, child
  and sibling selectors, `:first-child`, `:nth-child()` and `:is()` are resolved
  against the component's markup at build time
  A Style cannot reach an element's parent, children or siblings, so these are
  build errors that say what to write instead: `float`, `position: sticky`,
  `right` and `bottom`, `flex-wrap` (WinUI has no wrapping panel), a % size other than
  100%, `calc()` with a % or a variable, any unit but px, deg, s, ms, fr, auto and unitless numbers (the compiler and
  stylelint both refuse it), container style queries, `:has()`, `:focus-within`,
  `clip-path` as
  `rect()` or `xywh()`, `mask-position`, `mask-size`, `mask-repeat` and `url()`
  filters
  A container's `align-items`, `justify-content`, `place-items`, its children's
  `flex-grow`, `flex-basis` and `order`, and `display: flex` on a `<grid>` are
  lowered at build time into generated classes on the children (and the
  children are written in `order`), so they work where the markup fixes the
  children (`src/css/API.md`, Containers); `text-transform` shows the text
  changed and keeps the source text; a `transition` on `border-color` runs a
  color animation on the border brush
  `cursor` works through `winui-svelte/css/cursor` (the system cursor shapes;
  a `url()` cursor image has no WinUI counterpart)
  Gradients are `linear-gradient()` and `radial-gradient()` only
  (no repeating or conic ones, no stop in `px`), and replace `background-color`
  `@media (prefers-color-scheme)` and `@media (forced-colors: active)` can
  declare custom properties only (a Style cannot depend on the scheme)
- **Some CSS is opt-in, and approximate.** `transform` is a 2D RenderTransform
  that a transition animates only as translate, rotate and scale in that order;
  `filter`, `backdrop-filter`, `mix-blend-mode` and `mask-image` draw the element
  through a sprite in its parent's child visual slot, so an element with one
  draws over the later siblings it overlaps, and one whose parent already holds a
  Composition child visual of its own cannot take one; `-winui-elevation` is a `ThemeShadow`, which needs
  Windows 11 (or receivers a Style cannot set); `outline` is the control's focus
  visual
  A custom property on a class applies when the class is on the element
  as it is created: WinUI reads a theme resource again only on a theme change
- **A hot update to a component that is not self-contained** (a changed `.ts`
  module no component accepts) cannot be applied in place; the dev server says
  so and the window must be restarted
  A hot update that cannot compile is
  reported and the window keeps its code
- **A component's new root control after a hot update** replaces the old one in
  a panel's children, a border's child or a content control's content
  A host
  that holds the root somewhere else must listen with `mounted.onRootChange`
  (`createWindow` does)
- **Electron**: tested with a main process that spawns Node; not supported with the window inside Electron's own Node (access denied)

</details>

## Development

In this repository (run these at its root):

<details>
<summary>Commands</summary>

| Command | What |
| --- | --- |
| `pnpm test` | the unit tests, the generator's tests, and the mount test: every component made and linked in a real WinUI window that opens off screen and never takes focus |
| `pnpm test:windows` | every test that opens real windows, one file at a time, in background windows (`WINUI_SVELTE_BACKGROUND=1`) at below-normal priority; the results are under `.verify/test-windows`; it needs an ordinary desktop session |
| `pnpm lint` | every check: oxlint, ESLint (Google TypeScript style), stylelint, `tsc`, `svelte-check`, the editor check, WebStorm's inspections (`pnpm check:webstorm`, where WebStorm is installed), fallow, the check that the generated files are current and the tarball check; `pnpm lint:summary` counts the violations per rule and folder |
| `pnpm lint:fix` | the fixes oxlint and ESLint can apply themselves, then oxlint again |
| `pnpm fallow:audit` | the dead-code audit of what changed since `HEAD`; the pre-commit hook runs it |
| `pnpm gen:components` | regenerates the components, their metadata, the class list the bindings are generated for and the components table in API.md and the quick start in this README from WinUI's metadata (`pnpm restore` first) |
| `pnpm bindings` | the WinUI bindings (winapp's run, then the WebView2 step); [CONTRIBUTING.md](https://github.com/avi12/winui-svelte/blob/main/CONTRIBUTING.md) says when |
| `pnpm build` | `dist/`: what is published (`pnpm pack` shows the tarball) |
| `pwsh examples/hello/run.ps1` | the hello example in a background window, checked through UI Automation (`-Edit` also checks hot reload) |

</details>

[DESIGN.md](https://github.com/avi12/winui-svelte/blob/main/DESIGN.md) is the architecture and [API.md](https://github.com/avi12/winui-svelte/blob/main/API.md) the core API

## License

[Apache-2.0](https://github.com/avi12/winui-svelte/blob/main/LICENSE)
Copyright 2026 [Avi](https://avi12.com)
Copies and forks
must keep the `LICENSE` and the `NOTICE` file, which carries this credit
(Apache-2.0, section 4), so it travels with the code
