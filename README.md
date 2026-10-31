# winui-svelte

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
  and plain numbers, never `%` or `rem` ([Styling with CSS](#styling-with-css))
- **State** shared with the host goes through `winui-svelte/state`
  (`hostState`, `send`); the host and the window talk in JSON lines
  ([State](#state), [Host integration](#host-integration))
- **Web APIs** (`Notification`, `navigator.geolocation`, the clipboard and the
  rest) are the browser's own, backed by Windows; call them as on the web
  ([Web APIs](#web-apis))
- **Shipping:** `buildApp` from `winui-svelte/vite` builds one file per entry
  that plain Node runs; leave minify off ([Entry points](#entry-points))
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
// a timer takes the server's hot updates in, since WinUI holds this thread.

const RECEIVE_MILLISECONDS = 30;
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
  const { runner, receive } = createWindowModuleRunner(parsedData.data.modules);
  const { createWindow, runWindow, startTimer } = await runner.import<typeof WindowModule>("winui-svelte/window");
  const { default: appComponent } = await runner.import("/App.svelte");
  await runWindow({
    onStart() {
      startTimer({
        milliseconds: RECEIVE_MILLISECONDS,
        onTick: receive
      });
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

## Web APIs

Features beyond the controls come through the web's own APIs, wired to
WinRT and Win32, so web libraries and web knowledge work unchanged:
`Notification`, `navigator.permissions`, geolocation, the clipboard, media
devices, Bluetooth and the rest of the table below; nothing is a bespoke API
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

Every feature falls in one of three kinds, decided in this order

- **Web**: a standard Web API exists; it behaves as the spec says, byte for
  byte, and nothing else is added
- **Web plus extras**: a standard Web API exists and WinRT can do more; the
  extras are optional, lowerCamelCase members of the API's own option
  dictionaries and objects (`new Notification(title, { progress, scenario })`,
  `event.userInput`, `notification.update()`), never a second entry point; code
  written for browsers never passes them and behaves the same, and they are
  typed by declaration merging that ships with the opt-in subpath, so they
  autocomplete only where you import it
- **As is**: no Web API exists (credential vault, sockets, background
  transfer, imaging, on-device AI); the WinRT class itself is used with the
  names and semantics of the bindings, fully typed: async operations are
  promises (with an optional `AbortSignal`), events are `onX(callback)`
  returning an unsubscribe function, vectors iterate, properties are
  accessors; the import path mirrors the namespace and the class name is
  WinRT's own, so every bound class is one import away with nothing to
  generate:

  ```ts
  import { PasswordCredential } from "winui-svelte/bindings/windows/security/credentials/PasswordCredential";
  ```

  (`#winui/*` is the route for the classes an app generates for itself); a
  class not yet bound is added to `lateClasses` in
  `scripts/codegen/tables.ts` and bound with `pnpm bindings:after-winapp`;
  nothing wraps what needs no wrapping

| Web API | Subpath | Kind | Identity needed | State |
| --- | --- | --- | --- | --- |
| `navigator.permissions`, `PermissionStatus` | `winui-svelte/web-apis` | web | none | done |
| `Notification` (buttons, inputs, progress, scenario) | `winui-svelte/web-apis/notification` | web plus extras | optional: an unpackaged app registers an `identity` and an `appUserModelId` | done |
| `PushManager`, `PushSubscription` (`remoteId`) | `winui-svelte/web-apis/push` | web plus extras | package identity or a registered AppUserModelId | done |
| `navigator.setAppBadge`, `clearAppBadge` (status glyphs) | `winui-svelte/web-apis/badging` | web plus extras | package identity or a registered AppUserModelId | done |
| `launchQueue` (files and protocol addresses) | `winui-svelte/web-apis/launch` | web plus extras | none | done |
| `navigator.geolocation` (position source, civic address) | `winui-svelte/web-apis/geolocation` | web plus extras | none | done |
| `navigator.getBattery()` (capacity, charge rate) | `winui-svelte/web-apis/battery` | web plus extras | none | done |
| `navigator.connection`, `online`, `offline` (cost, signal) | `winui-svelte/web-apis/network` | web plus extras | none | done |
| `navigator.getGamepads()`, `GamepadHapticActuator` (trigger rumble) | `winui-svelte/web-apis/gamepad` | web plus extras | none | done |
| `Accelerometer`, `Gyroscope`, `Magnetometer`, orientation and ambient light sensors (barometer, altimeter, compass) | `winui-svelte/web-apis/sensors` | web plus extras | none | done |
| `screen`, `devicePixelRatio`, `getScreenDetails()` (monitor EDID data) | `winui-svelte/web-apis/screen` | web plus extras | none | done |
| `navigator.clipboard`, `ClipboardItem`, `clipboardchange` (files, custom formats, history) | `winui-svelte/web-apis/clipboard` | web plus extras | none | done |
| `navigator.share`, `navigator.canShare` | `winui-svelte/web-apis/share` | web plus extras | package identity, or a `window` to share from | done |
| `showOpenFilePicker`, `showSaveFilePicker`, `showDirectoryPicker`, `FileSystem*Handle` | `winui-svelte/web-apis/file-system` | web plus extras | none | done |
| `navigator.storage` (`estimate`, `persist`, origin private file system) | `winui-svelte/web-apis/storage` | web plus extras | none | done |
| `localStorage`, `sessionStorage`, `StorageEvent` | `winui-svelte/web-apis/web-storage` | web plus extras | none | done |
| `document.visibilityState`, focus, Fullscreen API, `document.title`, `window.close()` | `winui-svelte/web-apis/page` | web plus extras | none | done |
| `requestAnimationFrame`, `requestIdleCallback` | `winui-svelte/web-apis/timing` | web | none | done |
| `ResizeObserver`, `IntersectionObserver`, `MutationObserver` | `winui-svelte/web-apis/observers` | web plus extras | none | done |
| `element.animate()`, `Animation`, `KeyframeEffect` | `winui-svelte/web-apis/animations` | web plus extras | none | done |
| `navigator.mediaDevices` (`getUserMedia`, `getDisplayMedia`, `enumerateDevices`), `MediaStream`, `MediaRecorder` | `winui-svelte/web-apis/media-devices` | web plus extras | none (a camera or microphone needs the Windows privacy switch on) | done |
| `speechSynthesis`, `SpeechSynthesisUtterance`, `SpeechRecognition` (SSML, silences, scenario, phrases) | `winui-svelte/web-apis/speech` | web plus extras | none | done |
| `navigator.mediaSession`, `MediaMetadata` | `winui-svelte/web-apis/media-session` | web plus extras | none | done |
| `navigator.bluetooth` (your own chooser, GATT, notifications, advertisements) | `winui-svelte/web-apis/bluetooth` | web plus extras | none | done |
| `navigator.usb` (WinUSB devices) | `winui-svelte/web-apis/usb` | web plus extras | none | done |
| `navigator.hid` (input, output and feature reports) | `winui-svelte/web-apis/hid` | web plus extras | none | done |
| `navigator.serial` (byte streams, control signals) | `winui-svelte/web-apis/serial` | web plus extras | none | done |
| `navigator.wakeLock` (screen) | `winui-svelte/web-apis/wake-lock` | web plus extras | none | done |
| `IdleDetector` (user and screen state) | `winui-svelte/web-apis/idle` | web plus extras | none | done |
| `navigator.credentials`, `PasswordCredential`, `PublicKeyCredential` (Windows Hello) | `winui-svelte/web-apis/credentials` | web plus extras | none | done |
| `EyeDropper` | `winui-svelte/web-apis/eye-dropper` | web plus extras | none | done |
| `navigator.contacts` (Contact Picker) | `winui-svelte/web-apis/contacts` | web plus extras | for most apps, package identity | done |

Every row is built and tested; the timers (`setTimeout`, `setInterval`,
`setImmediate`) and `fetch` need no install, because the window thread has them
from `runWindow` (see [Timers and I/O](https://github.com/avi12/winui-svelte/blob/main/API.md#timers-and-io))
An "As is" class needs no row: every bound WinRT class is one import away

## Host integration

The window is a process (or a worker) that something else owns
What the host
sends and receives is the same everywhere: JSON values, one per line on stdio,
or the same objects through a `MessagePort`
State the host owns reaches the
window as one deeply reactive object, and the window answers with actions; see
[`src/state/README.md`](https://github.com/avi12/winui-svelte/blob/main/src/state/README.md) for the wire protocol, `hostState`
and `send`

**Tauri** (what [Edge+](https://github.com/avi12/edge-plus) does)
The Rust
core starts the window as a child process
(a sidecar: your `main.ts`, or a bundled executable with Node inside) with its
stdin and stdout piped, writes request lines
(`{"id":1,"type":"snapshot","data":{"name":"view","value":{...}},"timestamp":...}`)
and later `patch` ones, and reads `action` requests back, answering each with a
response line (`{"id":1,"response":null}` or `{"id":1,"error":"..."}`)
In the
window, `createStdioTransport()` and `reserveStdout()` (so a
stray `console.log` goes to stderr and cannot corrupt the protocol) are the
other end
Edge+'s `app/panel-tauri` (`ui/main.ts`, with the core in
`src-tauri`) is the working example

**Electron.** The main process starts the window with
`utilityProcess.fork("main.js")` (or `child_process.spawn` of Node) and speaks
the same messages over the process's stdio or a `MessagePort`; the main
process is where the state lives and where `diff(previous, next)` from
`winui-svelte/state/host` makes the patches
The Windows App SDK is started by
the window's own process, so the Electron renderer is not involved
This path was run with Electron 45 (Node 24): its main process spawned
Node, which opened the window and answered `info` and `close` over stdio
(`pnpm verify:electron` repeats it in a throwaway install under `.verify`)
The window cannot start inside Electron's own Node (`ELECTRON_RUN_AS_NODE`,
and so `utilityProcess`): the system denies the Windows App SDK there (0x80070005),
so spawn a Node process

**Node.** The simplest host is your own script: it starts the Windows App SDK
and the window as `main.ts` above does, and keeps its state in plain objects
`examples/counter` is a host in Node that owns `{ count, history }`, sends it
with `diff()`, and answers the window's actions over a `MessagePort`
(`examples/counter/run.ps1` clicks its buttons through UI Automation)

## Controls

Every concrete WinUI 3 control, and every value object a property can take, is
a component in `winui-svelte/components`
A component has the properties of its
WinUI class and of every class it inherits from, as camelCase props (`isOn`,
`horizontalAlignment`), its events as `on...` props named like the DOM's, in
lowercase (`ontoggled`, `onselectionchanged`), and `bind:`
on a property that has a matching change event
The table shows what each class
adds; `Bindable` includes the inherited bindables
`Children` says the
component takes content (its WinUI content property: `Content`, `Child`,
`Children`, `Items`...) as children

[The table of every component](https://github.com/avi12/winui-svelte/blob/main/API.md#controls-winui-sveltecomponents) lists what each class adds, with a link to its WinUI docs

How a value is written:

- An enum prop takes the member's value from `winui-svelte/enums`
  (`horizontalAlignment={HorizontalAlignment.Center}`; the value and its type
  share the name) or the member's WinUI name as text, and nothing else, so the
  editor offers exactly the members; a flag enum also
  takes a list of names (`modifiers={["Control", "Shift"]}`)
- Padding, margin, spacing, font size, colours and sizes are CSS, in the
  `<style>` of the component (see Styling with CSS); the props of those names
  exist as WinUI has them, and a prop beats a rule
- A thickness takes `8`, `[8, 4]`, `[left, top, right, bottom]` or a CSS-order
  string; a corner radius a number or an array; a grid length `"Auto"`, `"*"`,
  `"2*"` or pixels
- A brush takes a color (`"#0078d4"`, `"transparent"`), one of WinUI's theme
  brushes by name (`"AcrylicBackgroundFillColorDefaultBrush"`, the `ThemeBrush`
  set), so light and dark stay WinUI's, or a brush the app names in
  `AppBrushes` (see API.md, Closed sets)
- A time (`duration`, `beginTime`, a key frame's `keyTime`) takes milliseconds
  (`300`) or text with its unit (`"0.3s"`, `"2m"`) or as a clock
  (`"0:00:05"`); a `duration` also takes `"auto"` and `"forever"`, and a
  `repeatBehavior` a count (`3`, `"3x"`), a length of time or `"forever"`
- A date (`DatePicker.date`, `CalendarDatePicker.minDate`) takes a `Date`,
  milliseconds since 1970 or an ISO string, and `null` where WinUI allows none
  A bound date or time reads back as a `Date` or as milliseconds
- A `fontWeight` takes a name (`"bold"`, `"semiBold"`) or a number from 1 to
  999
- A point, size, rect, matrix or vector takes an array (`[x, y]`,
  `[width, height]`, `[x, y, width, height]`, `[x, y, z]`) or WinUI's own
  object
  A list of points (`points` of a `Polygon`) takes points or text
  (`"0,0 10,0 10,10"`); a list of numbers (`strokeDashArray`) takes numbers or
  text (`"4 2"`)
- A geometry prop (`Path.data`, `PathIcon.data`) takes path data as XAML writes
  it (`"M0,0 L10,10"`)
- An image source takes a URI (one ending in `.svg` is drawn as an SVG) or the
  bytes of an image file (`Uint8Array`, `ArrayBuffer`)
  A `MediaPlayerElement`'s
  `source` takes a URI
- An `itemsSource` takes an array, which becomes the collection WinUI reads; an
  `inputScope` takes a name (`"Url"`) or a list of names
- A property that takes any object (`header`, `content`) takes a string, which
  is boxed for it, or a control
- Attached properties are plain props: `gridRow`, `gridColumn`, `gridRowSpan`,
  `gridColumnSpan`, `canvasLeft`, `canvasTop`, `canvasZIndex`,
  `automationName`, `automationHelpText`, `toolTip`
  Any other:
  `attached={[Owner, "Property", value]}`
- A `ref` to the native control: `{@attach control(native => ...)}` from
  `winui-svelte` hands your code the WinUI object (typed from your bindings);
  `withControl(StackPanel, panel => ...)` checks its class first

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

The transitions an element plays are the same: `transitions`,
`childrenTransitions` (a panel), `childTransitions` (a `Border`, a `Popup`),
`contentTransitions`, `itemContainerTransitions`, `headerTransitions` and
`footerTransitions` are snippets that hold transition components
(`EntranceThemeTransition`, `RepositionThemeTransition`...)
WinUI leaves
these collections null; the renderer makes the `TransitionCollection` when the
snippet has a transition in it

```svelte
<StackPanel>
  {#snippet childrenTransitions()}
    <EntranceThemeTransition />
    <RepositionThemeTransition />
  {/snippet}
</StackPanel>
```

One written directly among an element's children (a `Storyboard`) is made but
placed nowhere; reach it with
`{@attach control(storyboard => storyboard.begin())}`

Items come in two forms
`ListView`, `GridView`, `ItemsRepeater`, `ItemsView`,
`BreadcrumbBar` and `TreeView` take `items`, `key` and an `item` snippet, and
keep a row only for each item the control has realized; a `TreeView` also takes
`children` (the items under an item) and `bind:expandedKeys`, and a `ListView`
or `GridView` can show its items in groups (`groupBy`, `groupHeader`)
A
control whose items are controls takes them as Svelte's own blocks: `{#each}`
in the children of `ComboBox`, `FlipView` and `ListBox`, or in the snippet of
`NavigationView` (`menuItems`), `TabView` (`tabItems`) and `RadioButtons`
(`items`)
[API.md](https://github.com/avi12/winui-svelte/blob/main/API.md) has the details

Pages are Svelte components: `Navigator` shows one in a content control and
keeps the back and forward history (`Frame` needs a page type XAML
registered, which a Node host cannot give it)
A page's props are the params
it was navigated to with, and its `NavigationCacheMode` says whether it stays
mounted, with its state, while the user is elsewhere:

```svelte
<script lang="ts">
  import { NavigationCacheMode } from "winui-svelte/components";

  let navigator = $state<NavigatorHandle>();
</script>

<Navigator bind:handle={navigator} onready={ready => ready.navigate({ page: HomePage })}>
  {#snippet transition()}
    <DrillInNavigationTransitionInfo />
  {/snippet}
</Navigator>

<Button onclick={() => navigator?.navigate({
  page: { component: SettingsPage, cacheMode: NavigationCacheMode.REQUIRED },
  params: { section: "display" }
})}>Settings</Button>
```

`handle.goBack()`, `goForward()`, `canGoBack`, `canGoForward` and `current`
complete it; [API.md](https://github.com/avi12/winui-svelte/blob/main/API.md) has the details, and `examples/navigation` ties
it to a `NavigationView`

`WebView2` is a component like the rest
Its native libraries ship with the
package and `initWindowsAppSdk` makes them findable; the browser starts in an
ordinary desktop session, not in a sandboxed process
A `data:` URL is blocked
as the top frame, as WebView2 does

Win2D is opt-in: `import { Canvas } from "winui-svelte/win2d"`, and
`<Canvas draw={({ painter }) => painter.fillCircle({ x: 50, y: 50, radius: 40, paint: { a: 255, r: 255, g: 0, b: 0 } })} />`
draws, and draws again when the state `draw` read changes; the Win2D effects
(`GaussianBlurEffect`, `ColorMatrixEffect`, `BlendEffect`, `ShadowEffect`...) draw
through `painter.drawImage`
An app that does not import it does not bundle it
`winui-svelte/win2d/context-2d` (also opt-in) makes a canvas of it that a library written for an HTML canvas draws on:
`createCanvas2D().getContext("2d")`, or `<Canvas2D bind:canvas />`, give a `CanvasRenderingContext2D` over Win2D
[API.md](https://github.com/avi12/winui-svelte/blob/main/API.md) has the details, what is supported and what is not, and `examples/win2d` the example

The raw elements the components are made of work too:
`<stack-panel>`, `<text-block>`, `grid.column={1}` for an attached property; they need
`registerControls(...)` with the classes they name (a component registers only
its own class, when it is made, so an app bundles only the bindings it uses)
Components are the supported way; see [API.md](https://github.com/avi12/winui-svelte/blob/main/API.md) for the raw forms and
the renderer's functions

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

- A control joins the form above it through an attachment named for its kind:
  `textField` (TextBox, AutoSuggestBox), `passwordField`, `numberField`,
  `sliderField`, `ratingField`, `checkField` (CheckBox, ToggleButton),
  `switchField`, `selectField` (ComboBox, RadioButtons), `dateField`
  (DatePicker, CalendarDatePicker), `timeField`, `colorField`
- WinUI components have no `name` prop (a prop on 600 generated components
  would be a second state beside `bind:`), so the attachment carries it; the
  control keeps its own value, `bind:text` still works, and the form reads
  the control through its property and change event
- The HTML attributes are typed options: `required`, `minLength`, `maxLength`,
  `min`, `max`, `step`, `pattern` and `type` (`email`, `url`, `number`, and so
  on); each field has a `ValidityState` (`valueMissing`, `typeMismatch`,
  `patternMismatch`, `tooShort`, `tooLong`, `rangeUnderflow`, `rangeOverflow`,
  `stepMismatch`, `badInput`, `customError`, `valid`) and `setCustomValidity`
- `schema` is a zod schema: its issues become field errors by path, and its
  output types `data`, so `onsubmit({ data })` is the schema's inferred type
  (without a schema, `data` is the entries as an object, and `formData` is a
  `FormValues`, a `FormData` for numbers, booleans and dates that
  `Object.fromEntries` reads)
- `bind:handle` gives `requestSubmit()` (validates, then submits), `submit()`
  (no validation), `reset()`, `checkValidity()`, `reportValidity()`, `values()`,
  `field(name)`, and the reactive `isPending`, `isSubmitted` and `isValid`
- `action` is an async function that runs after `onsubmit`; while it runs the
  controls and buttons are disabled and `isPending` is true
- An invalid control gets a red border and its accessible help text; the
  first invalid control takes focus; the error shows once the user has left the
  field or tried to submit (HTML's `:user-invalid`), then follows each change;
  `FormField` shows it under the control in a polite live region, so a screen
  reader announces it
- Enter in a single-line field clicks the first submit button (or submits when
  the form has one text field and no button); Escape calls `oncancel`;
  `formButton({ kind: "reset" })` resets, `"button"` does nothing to the form
- `noValidate` skips validation on submit, and a field or button outside the
  `Form` joins it with `form: handle`
- A selected ComboBoxItem reaches JavaScript as an opaque object, so a
  `selectField` collects the item itself when it is text, a number or a
  boolean, else its index; `values: ["Free", "Pro"]` (one per item) or
  `itemValue` says what it stands for
- Limits: WinUI has no `:invalid` or `:required` visual states for the style
  sheet to match, so the form states live on `handle.field(name)`
  (`isUserInvalid`, `isTouched`, `isDirty`, `validity`) for a component to
  bind a class or a property to; there is no HTTP `method` or `action` URL
  (submitting is your callback); a schema with an async refinement is not run

`examples/form` is the working example (`test/forms.test.ts` fills it in
through UI Automation and reads back the errors and the submitted data); the
gallery's Form submission page shows it
## Media

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

## Windows devices

Windows' own device APIs, kept under their Windows names and made reactive: a
`DeviceWatcher` that fills an `{#each}`, the mouse and keyboard Windows
sees, Bluetooth LE scanning and GATT, printers with their state, the battery,
the network, displays, audio endpoints, gamepads and sensors
Each area is an opt-in import, and works from `node.exe` with no package
identity

```svelte
<script lang="ts">
  import { StackPanel, TextBlock } from "winui-svelte/components";
  import { DeviceClass, deviceWatcher } from "winui-svelte/devices/enumeration";
  import { battery } from "winui-svelte/devices/power";
  import { printers } from "winui-svelte/devices/printers";

  const speakers = deviceWatcher({ deviceClass: DeviceClass.AudioRender });
  const power = battery();
  const installed = printers();
</script>

<StackPanel>
  <TextBlock>Battery {power.hasBattery ? `${power.percent}%` : "none"}</TextBlock>
  {#each speakers.devices.items as device (device.id)}
    <TextBlock>{device.name}</TextBlock>
  {/each}
  {#each installed.printers as printer (printer.name)}
    <TextBlock>{printer.name}{printer.isOffline ? " (offline)" : ""}</TextBlock>
  {/each}
</StackPanel>
```

Every list is a keyed collection, every value a getter that re-runs when
Windows says it changed, and every watcher stops with its component
What does not work unpackaged (`MouseDevice`, the print dialog of
`PrintManager`, geolocation) and the failure modes are in
[`API.md`](https://github.com/avi12/winui-svelte/blob/main/API.md#windows-devices-winui-sveltedevices)

## Styling with CSS

`<style>` blocks are translated at build time into WinUI `Style`s and applied
by class, so a card is `class="card"` and a rule, as on the web
Layout
properties map onto WinUI's panels
A declaration with no WinUI meaning is a
build error with its file and line; nothing is silently ignored
[`src/css/API.md`](https://github.com/avi12/winui-svelte/blob/main/src/css/API.md) is the interface; what maps:

| CSS | WinUI |
| `margin`, `padding`, `border-width`, `border-color`, `border-radius` | `Margin`, `Padding`, `BorderThickness`, `BorderBrush`, `CornerRadius` |
| `color`, `background-color`, `opacity` | `Foreground`, `Background`, `Opacity` |
| `background-image` or `background` with `linear-gradient()` or `radial-gradient()` | a `LinearGradientBrush` or `RadialGradientBrush` Background (a sheet that uses one carries the parser; one that does not, does not) |
| `width`, `height`, `min-*`, `max-*` | `Width`, `Height`, `MinWidth`... |
| `font-size`, `font-weight`, `font-family`, `font-style`, `line-height`, `letter-spacing`, `text-align`, `text-wrap`, `text-overflow`, `text-decoration` | the `TextBlock` and `Control` font and text properties |
| `gap`, `row-gap`, `column-gap` | `Spacing` (a stack), `RowSpacing` and `ColumnSpacing` (a grid) |
| `flex-direction`, `display: flex` on a stack, `align-self`, `justify-self` | `Orientation`, `VerticalAlignment`, `HorizontalAlignment` |
| `grid-template-columns`, `grid-template-rows` (`fr`, `px`, `auto`, `minmax()`, `fit-content()`, `repeat(n, ...)`), `grid-column`, `grid-row` | `ColumnDefinitions`, `RowDefinitions`, `Grid.Column`... |
| `display: none`, `visibility`, `pointer-events`, `z-index`, `overflow` | `Visibility`, `IsHitTestVisible`, `Canvas.ZIndex`, the scroll bar visibilities |
| `outline`, `outline-offset` | the focus visual: `FocusVisualPrimaryBrush`, `FocusVisualPrimaryThickness`, `FocusVisualMargin` |
| `animation`, `@keyframes` | `Storyboard`s of key frames (opacity, size, colors, translate, scale, rotate, transform), begun with the class |
| `box-shadow`, `aspect-ratio`, `user-select`, `object-fit`, `line-clamp`, `word-break` | a `ThemeShadow` of the blur's depth, a Height that follows the Width, `IsTextSelectionEnabled`, `Stretch`, `MaxLines`, `TextWrapping` |
| `-winui-elevation` | a `ThemeShadow` lifted by its depth |
| `filter`, `backdrop-filter`, `mix-blend-mode`, `mask-image` | an effect graph of Win2D effects (Gaussian blur, colour matrix, blend, alpha mask) that the element's Composition visual is drawn through; `backdrop-filter` samples a real backdrop brush |
| `clip-path`: `inset()` (with `round`), `circle()`, `ellipse()`, `polygon()`, `path()` | a `CompositionGeometricClip` on the element's visual |
| `translate`, `scale`, `rotate`, `transform-origin`, `transition`; `transform` (translate, scale, rotate, skew, matrix) | the UIElement transforms, their pivot (`CenterPoint`, 50% 50% as in CSS) and their implicit transitions |
| `var(--card-background-fill-color-default)` | `{ThemeResource CardBackgroundFillColorDefault}`: WinUI's own resources, so light and dark follow Windows |
| `--name: value` on `:root`, or on a class | an app-wide resource, or one only the elements with that class (and their templates) see: `.danger { --button-background-pointer-over: red }` |
| `.class`, `type`, `:hover`, `:focus`, `:active`, `:root`, `:where()` | class and type matching, the control's events, custom properties |

A length is written in the units WinUI has: px, and deg, s, ms, fr, auto and
unitless numbers where a property takes them; `padding: 8px`, `gap: 8px`,
`font-size: 20px`
Any other unit (`rem`, `em`, `pt`, `vw`, `cqw`, a percentage length and so on)
is a compile error from both the compiler and stylelint, with the message
saying what to write
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
  :global(.row) { padding: 8px; background-color: #123456 }
</style>
```

`itemContainerStyle="row"` names a class and no element of the component,
so the rule that styles it is written `:global(.row)`
A root element without `xmlns` gets WinUI's, and the wrong
root for the prop (a `DataTemplate` for `template`) is an error that names both
A key of `resources` is a custom property's name, as in a stylesheet, or the
resource's own (`ButtonBackground`); a color or length keeps the kind its key
has in WinUI (`ButtonBackground` is a brush, `ButtonPadding` a thickness)
`goToState({ control, name })` enters a state the control's template defines
[API.md](https://github.com/avi12/winui-svelte/blob/main/API.md) has the rest: what each `*Style` prop styles, `xamlOf`, and
what is not covered

## Transitions

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
The package adds `winui-svelte/state`: `createHostChannel(transport)`,
`hostState<View>(channel, "view")` and `channel.send(action)`, for state a Tauri
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

```svelte
<script lang="ts">
  import { clipboard, dropzone, enableDragEvents, filePicker, launchUri } from "winui-svelte/data-transfer";
  import type { DragEvent } from "winui-svelte/data-transfer";
  import { Border, Button, TextBlock } from "winui-svelte/components";

  enableDragEvents();
  let isOver = $state(false);
  let names = $state<string[]>([]);
</script>

<!-- files dragged from Explorer, filtered by accept -->
<Border
  class={isOver ? "zone over" : "zone"}
  {@attach dropzone({
    accept: ".png,.jpg,image/*",
    onDragStateChange: state => (isOver = state),
    onDrop: event => (names = event.dataTransfer.files.map(file => file.name))
  })}
>
  <TextBlock>Drop pictures here</TextBlock>
</Border>

<!-- the same events as HTML, on a raw element -->
<border
  ondragover={(event: DragEvent) => event.preventDefault()}
  ondrop={async (event: DragEvent) => console.log(await event.dataTransfer.files[0]?.text())}
>
  <text-block>Drop a text file</text-block>
</border>

<Button {@attach filePicker({ accept: "image/*", multiple: true, onPick: files => (names = files.map(file => file.name)) })}>
  Choose
</Button>
<Button onclick={() => clipboard.writeText("copied")}>Copy</Button>
<Button onclick={() => launchUri("https://example.com")}>Open</Button>
```

Dragging out (`ondragstart`, `draggable({ files })`), the `drag` event, the
clipboard's HTML, files and pictures, `pickSaveFile`, `revealInExplorer` and the
share pane are in [API.md](https://github.com/avi12/winui-svelte/blob/main/API.md#data-transfer-winui-sveltedata-transfer)
Unpackaged apps cannot open the share pane (it needs a package identity) and
get no scheme handler list from the launcher; everything else on this page runs
from `node.exe`
Raw elements take the web names after `enableDragEvents()`; components take the
attachments, because a component prop would pull this code into every app

## Entry points

| Specifier | What |
| `winui-svelte` | `control`, `withControl`, `mountControl`, `registerControls`, `dispatch` / `flush`, the value helpers |
| `winui-svelte/components` | every control as a component, and its props type; `xamlOf`, `goToState`, `installXaml` |
| `winui-svelte/enums` | every closed set a prop or option takes (`HorizontalAlignment`, `Backdrop`, `ThemeBrush`...), each a value and a type of one name ([`API.md`](https://github.com/avi12/winui-svelte/blob/main/API.md#closed-sets-winui-svelteenums)) |
| `winui-svelte/win2d`, `/win2d/context-2d` | `Canvas` and the Win2D helpers; `createCanvas2D` and `Canvas2D`, a `CanvasRenderingContext2D` over Win2D (both opt-in) |
| `winui-svelte/state` | the window's side of host state |
| `winui-svelte/state/host` | a JavaScript host's side: `diff`, transports, message types |
| `winui-svelte/messaging` | `defineMessaging`: typed request and response messages over a transport, loadable in plain Node |
| `winui-svelte/vite` | `winuiSvelte()` for `vite.config.ts`; `startModuleServer()` for hot reload |
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
| `winui-svelte/css`, `/css/vite`, `/css/sheet-module`, `/css/gradients` | the CSS runtime, its Vite plugin, the sheet module compiler and the gradient parser a sheet with a gradient imports ([`src/css/API.md`](https://github.com/avi12/winui-svelte/blob/main/src/css/API.md)) |
| `winui-svelte/preprocess`, `winui-svelte/stylelint`, `winui-svelte/vscode-css-data.json` | the editor side of the CSS: a Svelte preprocessor, a stylelint rule and VS Code custom data, all from the same validator and tables, so the editor, the linter and the build say the same thing ([`src/css/API.md`](https://github.com/avi12/winui-svelte/blob/main/src/css/API.md#diagnostics-in-the-editor-the-linter-and-the-build)) |

The published package ships `dist/`: the TypeScript compiled with its
declarations, and the Svelte files as source (with `types` and `svelte`
conditions on `exports`), which your Vite compiles (`winuiSvelte()`)

### Source maps

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

## Size

An app with one `Button` bundles to under the byte budget of the bundle test
(`scripts/pack/treeshake.test.ts`, the one place the number lives; it is
lowered as the package shrinks and never raised, and `pnpm test` fails when the
bundle grows past it), because the package is tree-shakeable: a consumer that
imports `Button` does not bundle `NavigationView`

## Limitations

Stated plainly, so nobody finds them by surprise:

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

## Development

In this repository (run these at its root):

| `pnpm test` | the unit tests, the generator's tests, and the mount test: every component made and linked in a real WinUI window that opens off screen and never takes focus |
| `pnpm test:windows` | every test that opens real windows, one file at a time, in background windows (`WINUI_SVELTE_BACKGROUND=1`) at below-normal priority; the results are under `.verify/test-windows`; it needs an ordinary desktop session |
| `pnpm lint` | every check: oxlint, ESLint (Google TypeScript style), stylelint, `tsc`, `svelte-check`, the editor check, WebStorm's inspections (`pnpm check:webstorm`, where WebStorm is installed), fallow, the check that the generated files are current and the tarball check; `pnpm lint:summary` counts the violations per rule and folder |
| `pnpm lint:fix` | the fixes oxlint and ESLint can apply themselves, then oxlint again |
| `pnpm fallow:audit` | the dead-code audit of what changed since `HEAD`; the pre-commit hook runs it |
| `pnpm gen:components` | regenerates the components, their metadata, the class list the bindings are generated for and the tables and quick start in this README from WinUI's metadata (`pnpm restore` first) |
| `pnpm bindings` | the WinUI bindings (winapp's run, then the WebView2 step); [CONTRIBUTING.md](https://github.com/avi12/winui-svelte/blob/main/CONTRIBUTING.md) says when |
| `pnpm build` | `dist/`: what is published (`pnpm pack` shows the tarball) |
| `pwsh examples/hello/run.ps1` | the hello example in a background window, checked through UI Automation (`-Edit` also checks hot reload) |

[DESIGN.md](https://github.com/avi12/winui-svelte/blob/main/DESIGN.md) is the architecture and [API.md](https://github.com/avi12/winui-svelte/blob/main/API.md) the core API

## License

[Apache-2.0](https://github.com/avi12/winui-svelte/blob/main/LICENSE)
Copyright 2026 [Avi](https://avi12.com)
Copies and forks
must keep the `LICENSE` and the `NOTICE` file, which carries this credit
(Apache-2.0, section 4), so it travels with the code
