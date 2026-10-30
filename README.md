# winui-svelte

WinUI 3 controls as Svelte components: native Windows apps written in Svelte,
the way React Native writes native apps in React
Every control is WinUI's own,
so the app looks and behaves like Windows: light and dark follow Windows, the
controls animate and are accessible as WinUI makes them, and acrylic is a real
backdrop
No browser engine is involved; there is no DOM

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
  transforms, animations, layouts...: 295 components in the table below) are
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
> tests and the [hello example](examples/hello) run
> See
> [CHANGELOG.md](CHANGELOG.md)

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

The files below are the [hello example](examples/hello), run for real by
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
WinUI's message loop never gives its thread
back, so `runOnUiThread` (the package's `/thread` entry) is a worker's first
call: it enters the apartment before anything creates a WinRT object
The
window's modules come from the host's dev server through the module runner, and
a timer takes the server's hot updates in (Node's own timers never fire while
WinUI holds the thread):

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

State changes need no `flushSync`: the window's loop is started with
`Application.startScheduled`, so Node drains microtasks after each WinUI
callback and Svelte's own flush runs
([experiment](examples/scheduling/README.md))

## Host integration

The window is a process (or a worker) that something else owns
What the host
sends and receives is the same everywhere: JSON values, one per line on stdio,
or the same objects through a `MessagePort`
State the host owns reaches the
window as one deeply reactive object, and the window answers with actions; see
[`src/state/README.md`](src/state/README.md) for the wire protocol, `hostState`
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

<!-- controls:start -->

| Component | Namespace | Props it adds | Bindable | Children |
| --- | --- | --- | --- | --- |
| [`AcrylicBrush`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.acrylicbrush) | Media | `alwaysUseFallback`, `tintColor`, `tintLuminosityOpacity`, `tintOpacity`, `tintTransitionDuration` |  |  |
| [`AdaptiveTrigger`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.adaptivetrigger) | Microsoft.UI.Xaml | `minWindowHeight`, `minWindowWidth` |  |  |
| [`AddDeleteThemeTransition`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.adddeletethemetransition) | Media.Animation |  |  |  |
| [`AnimatedIcon`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.animatedicon) | Controls | `fallbackIconSource`, `mirroredWhenRightToLeft`, `source` |  |  |
| [`AnimatedIconSource`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.animatediconsource) | Controls | `fallbackIconSource`, `mirroredWhenRightToLeft`, `source` |  |  |
| [`AnimatedVisualPlayer`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.animatedvisualplayer) | Controls | `animationOptimization`, `autoPlay`, `fallbackContent`, `playbackRate`, `source`, `stretch` |  |  |
| [`AnnotatedScrollBar`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.annotatedscrollbar) | Controls | `detailLabelTemplate`, `labels`, `labelTemplate`, `smallChange` |  |  |
| [`AppBar`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.appbar) | Controls | `closedDisplayMode`, `isOpen`, `isSticky`, `lightDismissOverlayMode` | `isOpen` | yes |
| [`AppBarButton`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.appbarbutton) | Controls | `dynamicOverflowOrder`, `icon`, `isCompact`, `keyboardAcceleratorTextOverride`, `label`, `labelPosition` |  | yes |
| [`AppBarElementContainer`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.appbarelementcontainer) | Controls | `dynamicOverflowOrder`, `isCompact` |  | yes |
| [`AppBarSeparator`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.appbarseparator) | Controls | `dynamicOverflowOrder`, `isCompact` |  |  |
| [`AppBarToggleButton`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.appbartogglebutton) | Controls | `dynamicOverflowOrder`, `icon`, `isCompact`, `keyboardAcceleratorTextOverride`, `label`, `labelPosition` | `isChecked` | yes |
| [`ArcSegment`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.arcsegment) | Media | `isLargeArc`, `point`, `rotationAngle`, `size`, `sweepDirection` |  |  |
| [`AutoSuggestBox`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.autosuggestbox) | Controls | `autoMaximizeSuggestionArea`, `description`, `header`, `isSuggestionListOpen`, `lightDismissOverlayMode`, `maxSuggestionListHeight`, `placeholderText`, `queryIcon`, +4 more | `text` | yes |
| [`BackEase`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.backease) | Media.Animation | `amplitude` |  |  |
| [`BezierSegment`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.beziersegment) | Media | `point1`, `point2`, `point3` |  |  |
| [`BitmapCache`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.bitmapcache) | Media |  |  |  |
| [`BitmapIcon`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.bitmapicon) | Controls | `showAsMonochrome`, `uriSource` |  |  |
| [`BitmapIconSource`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.bitmapiconsource) | Controls | `showAsMonochrome`, `uriSource` |  |  |
| [`BitmapImage`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.imaging.bitmapimage) | Media.Imaging | `autoPlay`, `createOptions`, `decodePixelHeight`, `decodePixelType`, `decodePixelWidth`, `uriSource` |  |  |
| [`Bold`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.documents.bold) | Documents |  |  | yes |
| [`Border`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.border) | Controls | `background`, `backgroundSizing`, `backgroundTransition`, `borderBrush`, `borderThickness`, `child`, `cornerRadius`, `padding` |  | yes |
| [`BounceEase`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.bounceease) | Media.Animation | `bounces`, `bounciness` |  |  |
| [`BreadcrumbBar`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.breadcrumbbar) | Controls | `itemsSource`, `itemTemplate` |  |  |
| [`BreadcrumbBarItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.breadcrumbbaritem) | Controls |  |  | yes |
| [`Button`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.button) | Controls | `flyout` |  | yes |
| [`CalendarDatePicker`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.calendardatepicker) | Controls | `calendarIdentifier`, `calendarViewStyle`, `date`, `dateFormat`, `dayOfWeekFormat`, `description`, `displayMode`, `firstDayOfWeek`, +10 more | `date` |  |
| [`CalendarPanel`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.calendarpanel) | Controls.Primitives |  |  | yes |
| [`CalendarView`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.calendarview) | Controls | `blackoutBackground`, `blackoutForeground`, `blackoutStrikethroughBrush`, `calendarIdentifier`, `calendarItemBackground`, `calendarItemBorderBrush`, `calendarItemBorderThickness`, `calendarItemCornerRadius`, +65 more |  |  |
| [`CalendarViewDayItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.calendarviewdayitem) | Controls | `isBlackout` |  |  |
| [`Canvas`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.canvas) | Controls |  |  | yes |
| [`CarouselPanel`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.carouselpanel) | Controls.Primitives | `canHorizontallyScroll`, `canVerticallyScroll`, `scrollOwner` |  | yes |
| [`CheckBox`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.checkbox) | Controls |  | `isChecked` | yes |
| [`CircleEase`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.circleease) | Media.Animation |  |  |  |
| [`CollectionViewSource`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.data.collectionviewsource) | Data | `isSourceGrouped`, `itemsPath`, `source` |  |  |
| [`ColorAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.coloranimation) | Media.Animation | `by`, `easingFunction`, `enableDependentAnimation`, `from`, `to` |  |  |
| [`ColorAnimationUsingKeyFrames`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.coloranimationusingkeyframes) | Media.Animation | `enableDependentAnimation` |  | yes |
| [`ColorPicker`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.colorpicker) | Controls | `color`, `colorSpectrumComponents`, `colorSpectrumShape`, `isAlphaEnabled`, `isAlphaSliderVisible`, `isAlphaTextInputVisible`, `isColorChannelTextInputVisible`, `isColorPreviewVisible`, +12 more | `color` |  |
| [`ColorPickerSlider`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.colorpickerslider) | Controls.Primitives | `colorChannel` | `value` |  |
| [`ColorSpectrum`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.colorspectrum) | Controls.Primitives | `color`, `components`, `hsvColor`, `maxHue`, `maxSaturation`, `maxValue`, `minHue`, `minSaturation`, +2 more | `color` |  |
| [`ColumnMajorUniformToLargestGridLayout`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.columnmajoruniformtolargestgridlayout) | Controls.Primitives | `columnSpacing`, `maxColumns`, `rowSpacing` |  |  |
| [`ComboBox`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.combobox) | Controls | `description`, `header`, `headerTemplate`, `isDropDownOpen`, `isEditable`, `isTextSearchEnabled`, `lightDismissOverlayMode`, `maxDropDownHeight`, +5 more | `selectedIndex`, `selectedItem`, `selectedValue`, `isDropDownOpen` | yes |
| [`ComboBoxItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.comboboxitem) | Controls |  |  | yes |
| [`CommandBar`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.commandbar) | Controls | `commandBarOverflowPresenterStyle`, `defaultLabelPosition`, `isDynamicOverflowEnabled`, `overflowButtonVisibility` | `isOpen` | yes |
| [`CommandBarFlyout`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.commandbarflyout) | Controls | `alwaysExpanded` | `open` |  |
| [`CommandBarFlyoutCommandBar`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.commandbarflyoutcommandbar) | Controls.Primitives | `systemBackdrop` | `isOpen` | yes |
| [`CommandBarOverflowPresenter`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.commandbaroverflowpresenter) | Controls |  |  | yes |
| [`CommonNavigationTransitionInfo`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.commonnavigationtransitioninfo) | Media.Animation | `isStaggeringEnabled` |  |  |
| [`CompositeTransform`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.compositetransform) | Media | `centerX`, `centerY`, `rotation`, `scaleX`, `scaleY`, `skewX`, `skewY`, `translateX`, +1 more |  |  |
| [`CompositeTransform3D`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.media3d.compositetransform3d) | Media.Media3D | `centerX`, `centerY`, `centerZ`, `rotationX`, `rotationY`, `rotationZ`, `scaleX`, `scaleY`, +4 more |  |  |
| [`ContentControl`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.contentcontrol) | Controls | `content`, `contentTemplate`, `contentTemplateSelector` |  | yes |
| [`ContentDialog`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.contentdialog) | Controls | `closeButtonCommand`, `closeButtonCommandParameter`, `closeButtonStyle`, `closeButtonText`, `defaultButton`, `fullSizeDesired`, `isPrimaryButtonEnabled`, `isSecondaryButtonEnabled`, +10 more | `open` | yes |
| [`ContentPresenter`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.contentpresenter) | Controls | `background`, `backgroundSizing`, `backgroundTransition`, `borderBrush`, `borderThickness`, `characterSpacing`, `content`, `contentTemplate`, +18 more |  | yes |
| [`ContentThemeTransition`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.contentthemetransition) | Media.Animation | `horizontalOffset`, `verticalOffset` |  |  |
| [`ContinuumNavigationTransitionInfo`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.continuumnavigationtransitioninfo) | Media.Animation | `exitElement` |  |  |
| [`CubicEase`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.cubicease) | Media.Animation |  |  |  |
| [`DatePicker`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.datepicker) | Controls | `calendarIdentifier`, `date`, `dayFormat`, `dayVisible`, `header`, `headerTemplate`, `lightDismissOverlayMode`, `maxYear`, +7 more | `date`, `selectedDate` | yes |
| [`DatePickerFlyout`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.datepickerflyout) | Controls | `calendarIdentifier`, `date`, `dayFormat`, `dayVisible`, `maxYear`, `minYear`, `monthFormat`, `monthVisible`, +2 more | `open` |  |
| [`DesktopAcrylicBackdrop`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.desktopacrylicbackdrop) | Media |  |  |  |
| [`DiscreteColorKeyFrame`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.discretecolorkeyframe) | Media.Animation |  |  |  |
| [`DiscreteDoubleKeyFrame`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.discretedoublekeyframe) | Media.Animation |  |  |  |
| [`DiscreteObjectKeyFrame`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.discreteobjectkeyframe) | Media.Animation |  |  |  |
| [`DiscretePointKeyFrame`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.discretepointkeyframe) | Media.Animation |  |  |  |
| [`DoubleAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.doubleanimation) | Media.Animation | `by`, `easingFunction`, `enableDependentAnimation`, `from`, `to` |  |  |
| [`DoubleAnimationUsingKeyFrames`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.doubleanimationusingkeyframes) | Media.Animation | `enableDependentAnimation` |  | yes |
| [`DragItemThemeAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.dragitemthemeanimation) | Media.Animation | `targetName` |  |  |
| [`DragOverThemeAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.dragoverthemeanimation) | Media.Animation | `direction`, `targetName`, `toOffset` |  |  |
| [`DrillInNavigationTransitionInfo`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.drillinnavigationtransitioninfo) | Media.Animation |  |  |  |
| [`DrillInThemeAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.drillinthemeanimation) | Media.Animation | `entranceTarget`, `entranceTargetName`, `exitTarget`, `exitTargetName` |  |  |
| [`DrillOutThemeAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.drilloutthemeanimation) | Media.Animation | `entranceTarget`, `entranceTargetName`, `exitTarget`, `exitTargetName` |  |  |
| [`DropDownButton`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.dropdownbutton) | Controls |  |  | yes |
| [`DropTargetItemThemeAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.droptargetitemthemeanimation) | Media.Animation | `targetName` |  |  |
| [`EasingColorKeyFrame`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.easingcolorkeyframe) | Media.Animation | `easingFunction` |  |  |
| [`EasingDoubleKeyFrame`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.easingdoublekeyframe) | Media.Animation | `easingFunction` |  |  |
| [`EasingPointKeyFrame`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.easingpointkeyframe) | Media.Animation | `easingFunction` |  |  |
| [`EdgeUIThemeTransition`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.edgeuithemetransition) | Media.Animation | `edge` |  |  |
| [`ElasticEase`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.elasticease) | Media.Animation | `oscillations`, `springiness` |  |  |
| [`Ellipse`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.shapes.ellipse) | Shapes |  |  |  |
| [`EllipseGeometry`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.ellipsegeometry) | Media | `center`, `radiusX`, `radiusY` |  |  |
| [`EntranceNavigationTransitionInfo`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.entrancenavigationtransitioninfo) | Media.Animation |  |  |  |
| [`EntranceThemeTransition`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.entrancethemetransition) | Media.Animation | `fromHorizontalOffset`, `fromVerticalOffset`, `isStaggeringEnabled` |  |  |
| [`Expander`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.expander) | Controls | `expandDirection`, `header`, `headerTemplate`, `headerTemplateSelector`, `isExpanded` | `isExpanded` | yes |
| [`ExponentialEase`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.exponentialease) | Media.Animation | `exponent` |  |  |
| [`FadeInThemeAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.fadeinthemeanimation) | Media.Animation | `targetName` |  |  |
| [`FadeOutThemeAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.fadeoutthemeanimation) | Media.Animation | `targetName` |  |  |
| [`FlipView`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.flipview) | Controls | `useTouchAnimationsForAllNavigation` | `selectedIndex`, `selectedItem`, `selectedValue` | yes |
| [`FlipViewItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.flipviewitem) | Controls |  |  | yes |
| [`Flyout`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.flyout) | Controls | `content`, `flyoutPresenterStyle` | `open` | yes |
| [`FlyoutPresenter`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.flyoutpresenter) | Controls | `isDefaultShadowEnabled` |  | yes |
| [`FontIcon`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.fonticon) | Controls | `fontFamily`, `fontSize`, `fontStyle`, `fontWeight`, `glyph`, `isTextScaleFactorEnabled`, `mirroredWhenRightToLeft` |  |  |
| [`FontIconSource`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.fonticonsource) | Controls | `fontFamily`, `fontSize`, `fontStyle`, `fontWeight`, `glyph`, `isTextScaleFactorEnabled`, `mirroredWhenRightToLeft` |  |  |
| [`Frame`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.frame) | Controls | `cacheSize`, `isNavigationStackEnabled`, `sourcePageType` | `backStackDepth`, `canGoBack`, `canGoForward` | yes |
| [`GeometryGroup`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.geometrygroup) | Media | `fillRule` |  | yes |
| [`Glyphs`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.documents.glyphs) | Documents | `colorFontPaletteIndex`, `fill`, `fontRenderingEmSize`, `fontUri`, `indices`, `isColorFontEnabled`, `originX`, `originY`, +2 more |  |  |
| [`GradientStop`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.gradientstop) | Media | `color`, `offset` |  | yes |
| [`Grid`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.grid) | Controls | `backgroundSizing`, `borderBrush`, `borderThickness`, `columnSpacing`, `cornerRadius`, `padding`, `rowSpacing` |  | yes |
| [`GridView`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.gridview) | Controls |  | `selectedIndex`, `selectedItem`, `selectedValue`, `selectedKey`, `selectedKeys` | yes |
| [`GridViewHeaderItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.gridviewheaderitem) | Controls |  |  | yes |
| [`GridViewItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.gridviewitem) | Controls |  |  | yes |
| [`GridViewItemPresenter`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.gridviewitempresenter) | Controls.Primitives | `checkBrush`, `checkHintBrush`, `checkSelectingBrush`, `contentMargin`, `disabledOpacity`, `dragBackground`, `dragForeground`, `dragOpacity`, +14 more |  | yes |
| [`GroupItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.groupitem) | Controls |  |  | yes |
| [`GroupStyle`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.groupstyle) | Controls | `containerStyleSelector`, `headerTemplate`, `headerTemplateSelector`, `hidesIfEmpty`, `panel` |  |  |
| [`Hub`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.hub) | Controls | `defaultSectionIndex`, `header`, `headerTemplate`, `isActiveView`, `isZoomedInView`, `orientation`, `semanticZoomOwner` |  | yes |
| [`HubSection`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.hubsection) | Controls | `contentTemplate`, `header`, `headerTemplate`, `isHeaderInteractive` |  | yes |
| [`Hyperlink`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.documents.hyperlink) | Documents | `elementSoundMode`, `isTabStop`, `navigateUri`, `tabIndex`, `underlineStyle`, `xYFocusDown`, `xYFocusDownNavigationStrategy`, `xYFocusLeft`, +5 more |  | yes |
| [`HyperlinkButton`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.hyperlinkbutton) | Controls | `navigateUri` |  | yes |
| [`IconSourceElement`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.iconsourceelement) | Controls | `iconSource` |  | yes |
| [`Image`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.image) | Controls | `nineGrid`, `source`, `stretch` |  |  |
| [`ImageBrush`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.imagebrush) | Media | `imageSource` |  |  |
| [`ImageIcon`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.imageicon) | Controls | `source` |  |  |
| [`ImageIconSource`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.imageiconsource) | Controls | `imageSource` |  |  |
| [`InfoBadge`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.infobadge) | Controls | `iconSource`, `value` |  |  |
| [`InfoBar`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.infobar) | Controls | `actionButton`, `closeButtonCommand`, `closeButtonCommandParameter`, `closeButtonStyle`, `content`, `contentTemplate`, `iconSource`, `isClosable`, +5 more | `isOpen` |  |
| [`InfoBarPanel`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.infobarpanel) | Controls.Primitives | `horizontalOrientationPadding`, `verticalOrientationPadding` |  | yes |
| [`InlineUIContainer`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.documents.inlineuicontainer) | Documents | `child` |  | yes |
| [`Italic`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.documents.italic) | Documents |  |  | yes |
| [`ItemContainer`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.itemcontainer) | Controls | `child`, `isSelected` |  |  |
| [`ItemsControl`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.itemscontrol) | Controls | `displayMemberPath`, `groupStyleSelector`, `itemContainerStyle`, `itemContainerStyleSelector`, `itemsPanel`, `itemsSource`, `itemTemplate`, `itemTemplateSelector` |  | yes |
| [`ItemsPresenter`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.itemspresenter) | Controls | `footer`, `footerTemplate`, `header`, `headerTemplate`, `padding` |  |  |
| [`ItemsRepeater`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.itemsrepeater) | Controls | `background`, `horizontalCacheLength`, `itemsSource`, `itemTemplate`, `itemTransitionProvider`, `layout`, `verticalCacheLength` |  |  |
| [`ItemsRepeaterScrollHost`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.itemsrepeaterscrollhost) | Controls | `horizontalAnchorRatio`, `scrollViewer`, `verticalAnchorRatio` |  |  |
| [`ItemsStackPanel`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.itemsstackpanel) | Controls | `areStickyGroupHeadersEnabled`, `cacheLength`, `groupHeaderPlacement`, `groupPadding`, `itemsUpdatingScrollMode`, `orientation` |  | yes |
| [`ItemsView`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.itemsview) | Controls | `isItemInvokedEnabled`, `itemsSource`, `itemTemplate`, `itemTransitionProvider`, `layout`, `selectionMode`, `verticalScrollController` |  |  |
| [`ItemsWrapGrid`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.itemswrapgrid) | Controls | `areStickyGroupHeadersEnabled`, `cacheLength`, `groupHeaderPlacement`, `groupPadding`, `itemHeight`, `itemWidth`, `maximumRowsOrColumns`, `orientation` |  | yes |
| [`KeyboardAccelerator`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.input.keyboardaccelerator) | Input | `isEnabled`, `key`, `modifiers`, `scopeOwner` |  |  |
| [`KeySpline`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.keyspline) | Media.Animation | `controlPoint1`, `controlPoint2` |  |  |
| [`Line`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.shapes.line) | Shapes | `x1`, `x2`, `y1`, `y2` |  |  |
| [`LinearColorKeyFrame`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.linearcolorkeyframe) | Media.Animation |  |  |  |
| [`LinearDoubleKeyFrame`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.lineardoublekeyframe) | Media.Animation |  |  |  |
| [`LinearGradientBrush`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.lineargradientbrush) | Media | `endPoint`, `startPoint` |  | yes |
| [`LinearPointKeyFrame`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.linearpointkeyframe) | Media.Animation |  |  |  |
| [`LineBreak`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.documents.linebreak) | Documents |  |  |  |
| [`LinedFlowLayout`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.linedflowlayout) | Controls | `itemsJustification`, `itemsStretch`, `lineHeight`, `lineSpacing`, `minItemSpacing` |  |  |
| [`LineGeometry`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.linegeometry) | Media | `endPoint`, `startPoint` |  |  |
| [`LineSegment`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.linesegment) | Media | `point` |  |  |
| [`ListBox`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.listbox) | Controls | `selectionMode`, `singleSelectionFollowsFocus` | `selectedIndex`, `selectedItem`, `selectedValue` | yes |
| [`ListBoxItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.listboxitem) | Controls |  |  | yes |
| [`ListPickerFlyout`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.listpickerflyout) | Controls | `displayMemberPath`, `itemsSource`, `itemTemplate`, `selectedIndex`, `selectedItem`, `selectedValue`, `selectedValuePath`, `selectionMode` | `open` |  |
| [`ListView`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.listview) | Controls |  | `selectedIndex`, `selectedItem`, `selectedValue`, `selectedKey`, `selectedKeys` | yes |
| [`ListViewHeaderItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.listviewheaderitem) | Controls |  |  | yes |
| [`ListViewItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.listviewitem) | Controls |  |  | yes |
| [`ListViewItemPresenter`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.listviewitempresenter) | Controls.Primitives | `checkBoxBorderBrush`, `checkBoxBrush`, `checkBoxCornerRadius`, `checkBoxDisabledBorderBrush`, `checkBoxDisabledBrush`, `checkBoxPointerOverBorderBrush`, `checkBoxPointerOverBrush`, `checkBoxPressedBorderBrush`, +51 more |  | yes |
| [`MapControl`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.mapcontrol) | Controls | `center`, `interactiveControlsVisible`, `layers`, `mapServiceToken`, `zoomLevel` |  |  |
| [`MapElementsLayer`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.mapelementslayer) | Controls | `mapElements` |  |  |
| [`MapIcon`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.mapicon) | Controls | `location` |  |  |
| [`Matrix3DProjection`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.matrix3dprojection) | Media | `projectionMatrix` |  | yes |
| [`MatrixTransform`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.matrixtransform) | Media | `matrix` |  |  |
| [`MediaPlayerElement`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.mediaplayerelement) | Controls | `areTransportControlsEnabled`, `autoPlay`, `isFullWindow`, `posterSource`, `source`, `stretch`, `transportControls` |  |  |
| [`MediaPlayerPresenter`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.mediaplayerpresenter) | Controls | `isFullWindow`, `mediaPlayer`, `stretch` |  |  |
| [`MediaTransportControls`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.mediatransportcontrols) | Controls | `fastPlayFallbackBehaviour`, `isCompact`, `isFastForwardButtonVisible`, `isFastForwardEnabled`, `isFastRewindButtonVisible`, `isFastRewindEnabled`, `isNextTrackButtonVisible`, `isPlaybackRateButtonVisible`, +17 more |  |  |
| [`MenuBar`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.menubar) | Controls |  |  |  |
| [`MenuBarItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.menubaritem) | Controls | `title` |  |  |
| [`MenuBarItemFlyout`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.menubaritemflyout) | Controls |  | `open` | yes |
| [`MenuFlyout`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.menuflyout) | Controls | `menuFlyoutPresenterStyle` | `open` | yes |
| [`MenuFlyoutItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.menuflyoutitem) | Controls | `command`, `commandParameter`, `icon`, `keyboardAcceleratorTextOverride`, `text` |  | yes |
| [`MenuFlyoutPresenter`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.menuflyoutpresenter) | Controls | `isDefaultShadowEnabled`, `systemBackdrop` |  | yes |
| [`MenuFlyoutSeparator`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.menuflyoutseparator) | Controls |  |  |  |
| [`MenuFlyoutSubItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.menuflyoutsubitem) | Controls | `icon`, `text` |  | yes |
| [`MicaBackdrop`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.micabackdrop) | Media | `kind` |  |  |
| [`MonochromaticOverlayPresenter`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.monochromaticoverlaypresenter) | Controls.Primitives | `replacementColor`, `sourceElement` |  | yes |
| [`NavigationThemeTransition`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.navigationthemetransition) | Media.Animation | `defaultNavigationTransitionInfo` |  | yes |
| [`NavigationView`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.navigationview) | Controls | `alwaysShowHeader`, `autoSuggestBox`, `compactModeThresholdWidth`, `compactPaneLength`, `contentOverlay`, `expandedModeThresholdWidth`, `footerMenuItemsSource`, `header`, +24 more | `isPaneOpen`, `selectedItem`, `displayMode` | yes |
| [`NavigationViewItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.navigationviewitem) | Controls | `hasUnrealizedChildren`, `icon`, `infoBadge`, `isChildSelected`, `isExpanded`, `menuItemsSource`, `selectsOnInvoked` |  | yes |
| [`NavigationViewItemHeader`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.navigationviewitemheader) | Controls |  |  | yes |
| [`NavigationViewItemPresenter`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.navigationviewitempresenter) | Controls.Primitives | `icon`, `infoBadge` |  | yes |
| [`NavigationViewItemSeparator`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.navigationviewitemseparator) | Controls |  |  | yes |
| [`NonVirtualizingLayout`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.nonvirtualizinglayout) | Controls |  |  |  |
| [`NumberBox`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.numberbox) | Controls | `acceptsExpression`, `description`, `header`, `headerTemplate`, `isWrapEnabled`, `largeChange`, `maximum`, `minimum`, +11 more | `value` |  |
| [`ObjectAnimationUsingKeyFrames`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.objectanimationusingkeyframes) | Media.Animation | `enableDependentAnimation` |  | yes |
| [`Page`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.page) | Controls | `bottomAppBar`, `navigationCacheMode`, `topAppBar` |  | yes |
| [`PaneThemeTransition`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.panethemetransition) | Media.Animation | `edge` |  |  |
| [`Paragraph`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.documents.paragraph) | Documents | `textIndent` |  | yes |
| [`ParallaxView`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.parallaxview) | Controls | `child`, `horizontalShift`, `horizontalSourceEndOffset`, `horizontalSourceOffsetKind`, `horizontalSourceStartOffset`, `isHorizontalShiftClamped`, `isVerticalShiftClamped`, `maxHorizontalShiftRatio`, +6 more |  |  |
| [`PasswordBox`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.passwordbox) | Controls | `description`, `header`, `headerTemplate`, `inputScope`, `isPasswordRevealButtonEnabled`, `maxLength`, `password`, `passwordChar`, +6 more | `password` |  |
| [`Path`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.shapes.path) | Shapes | `data` |  |  |
| [`PathFigure`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.pathfigure) | Media | `isClosed`, `isFilled`, `segments`, `startPoint` |  | yes |
| [`PathGeometry`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.pathgeometry) | Media | `figures`, `fillRule` |  | yes |
| [`PathIcon`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.pathicon) | Controls | `data` |  |  |
| [`PathIconSource`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.pathiconsource) | Controls | `data` |  |  |
| [`PersonPicture`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.personpicture) | Controls | `badgeGlyph`, `badgeImageSource`, `badgeNumber`, `badgeText`, `contact`, `displayName`, `initials`, `isGroup`, +2 more |  |  |
| [`PerspectiveTransform3D`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.media3d.perspectivetransform3d) | Media.Media3D | `depth`, `offsetX`, `offsetY` |  |  |
| [`PickerFlyout`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.pickerflyout) | Controls | `confirmationButtonsVisible`, `content` | `open` | yes |
| [`PipsPager`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.pipspager) | Controls | `maxVisiblePips`, `nextButtonStyle`, `nextButtonVisibility`, `normalPipStyle`, `numberOfPages`, `orientation`, `previousButtonStyle`, `previousButtonVisibility`, +3 more |  |  |
| [`Pivot`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.pivot) | Controls | `headerFocusVisualPlacement`, `headerTemplate`, `isHeaderItemsCarouselEnabled`, `isLocked`, `leftHeader`, `leftHeaderTemplate`, `rightHeader`, `rightHeaderTemplate`, +4 more | `selectedIndex`, `selectedItem` | yes |
| [`PivotHeaderPanel`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.pivotheaderpanel) | Controls.Primitives |  |  | yes |
| [`PivotItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.pivotitem) | Controls | `header` |  | yes |
| [`PivotPanel`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.pivotpanel) | Controls.Primitives |  |  | yes |
| [`PlaneProjection`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.planeprojection) | Media | `centerOfRotationX`, `centerOfRotationY`, `centerOfRotationZ`, `globalOffsetX`, `globalOffsetY`, `globalOffsetZ`, `localOffsetX`, `localOffsetY`, +4 more |  |  |
| [`PointAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.pointanimation) | Media.Animation | `by`, `easingFunction`, `enableDependentAnimation`, `from`, `to` |  |  |
| [`PointAnimationUsingKeyFrames`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.pointanimationusingkeyframes) | Media.Animation | `enableDependentAnimation` |  | yes |
| [`PointerDownThemeAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.pointerdownthemeanimation) | Media.Animation | `targetName` |  |  |
| [`PointerUpThemeAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.pointerupthemeanimation) | Media.Animation | `targetName` |  |  |
| [`PolyBezierSegment`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.polybeziersegment) | Media | `points` |  | yes |
| [`Polygon`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.shapes.polygon) | Shapes | `fillRule`, `points` |  |  |
| [`Polyline`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.shapes.polyline) | Shapes | `fillRule`, `points` |  |  |
| [`PolyLineSegment`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.polylinesegment) | Media | `points` |  | yes |
| [`PolyQuadraticBezierSegment`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.polyquadraticbeziersegment) | Media | `points` |  | yes |
| [`PopInThemeAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.popinthemeanimation) | Media.Animation | `fromHorizontalOffset`, `fromVerticalOffset`, `targetName` |  |  |
| [`PopOutThemeAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.popoutthemeanimation) | Media.Animation | `targetName` |  |  |
| [`Popup`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.popup) | Controls.Primitives | `child`, `desiredPlacement`, `horizontalOffset`, `isLightDismissEnabled`, `isOpen`, `lightDismissOverlayMode`, `placementTarget`, `shouldConstrainToRootBounds`, +2 more | `isOpen`, `actualPlacement` | yes |
| [`PopupThemeTransition`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.popupthemetransition) | Media.Animation | `fromHorizontalOffset`, `fromVerticalOffset` |  |  |
| [`PowerEase`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.powerease) | Media.Animation | `power` |  |  |
| [`ProgressBar`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.progressbar) | Controls | `isIndeterminate`, `showError`, `showPaused` | `value` |  |
| [`ProgressRing`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.progressring) | Controls | `isActive`, `isIndeterminate`, `maximum`, `minimum`, `value` |  |  |
| [`QuadraticBezierSegment`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.quadraticbeziersegment) | Media | `point1`, `point2` |  |  |
| [`QuadraticEase`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.quadraticease) | Media.Animation |  |  |  |
| [`QuarticEase`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.quarticease) | Media.Animation |  |  |  |
| [`QuinticEase`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.quinticease) | Media.Animation |  |  |  |
| [`RadialGradientBrush`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.radialgradientbrush) | Media | `center`, `gradientOrigin`, `interpolationSpace`, `mappingMode`, `radiusX`, `radiusY`, `spreadMethod` |  |  |
| [`RadioButton`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.radiobutton) | Controls | `groupName` | `isChecked` | yes |
| [`RadioButtons`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.radiobuttons) | Controls | `header`, `headerTemplate`, `itemsSource`, `itemTemplate`, `maxColumns`, `selectedIndex`, `selectedItem` | `selectedIndex`, `selectedItem` |  |
| [`RadioMenuFlyoutItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.radiomenuflyoutitem) | Controls | `groupName`, `isChecked` |  | yes |
| [`RatingControl`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.ratingcontrol) | Controls | `caption`, `initialSetValue`, `isClearEnabled`, `isReadOnly`, `itemInfo`, `maxRating`, `placeholderValue`, `value` | `value` |  |
| [`RatingItemFontInfo`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.ratingitemfontinfo) | Controls | `disabledGlyph`, `glyph`, `placeholderGlyph`, `pointerOverGlyph`, `pointerOverPlaceholderGlyph`, `unsetGlyph` |  |  |
| [`RatingItemImageInfo`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.ratingitemimageinfo) | Controls | `disabledImage`, `image`, `placeholderImage`, `pointerOverImage`, `pointerOverPlaceholderImage`, `unsetImage` |  |  |
| [`RatingItemInfo`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.ratingiteminfo) | Controls |  |  |  |
| [`Rectangle`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.shapes.rectangle) | Shapes | `radiusX`, `radiusY` |  |  |
| [`RectangleGeometry`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.rectanglegeometry) | Media | `rect` |  |  |
| [`RefreshContainer`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.refreshcontainer) | Controls | `pullDirection`, `visualizer` |  | yes |
| [`RefreshVisualizer`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.refreshvisualizer) | Controls | `content`, `orientation` |  |  |
| [`RelativePanel`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.relativepanel) | Controls | `backgroundSizing`, `borderBrush`, `borderThickness`, `cornerRadius`, `padding` |  | yes |
| [`RenderTargetBitmap`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.imaging.rendertargetbitmap) | Media.Imaging |  |  |  |
| [`ReorderThemeTransition`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.reorderthemetransition) | Media.Animation |  |  |  |
| [`RepeatButton`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.repeatbutton) | Controls.Primitives | `delay`, `interval` |  | yes |
| [`RepositionThemeAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.repositionthemeanimation) | Media.Animation | `fromHorizontalOffset`, `fromVerticalOffset`, `targetName` |  |  |
| [`RepositionThemeTransition`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.repositionthemetransition) | Media.Animation | `isStaggeringEnabled` |  |  |
| [`RevealListViewItemPresenter`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.reveallistviewitempresenter) | Controls |  |  | yes |
| [`RichEditBox`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.richeditbox) | Controls | `acceptsReturn`, `characterCasing`, `clipboardCopyFormat`, `description`, `desiredCandidateWindowAlignment`, `disabledFormattingAccelerators`, `header`, `headerTemplate`, +15 more |  |  |
| [`RichTextBlock`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.richtextblock) | Controls | `characterSpacing`, `fontFamily`, `fontSize`, `fontStretch`, `fontStyle`, `fontWeight`, `foreground`, `horizontalTextAlignment`, +18 more | `isTextTrimmed` | yes |
| [`RichTextBlockOverflow`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.richtextblockoverflow) | Controls | `maxLines`, `overflowContentTarget`, `padding` | `isTextTrimmed` |  |
| [`RotateTransform`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.rotatetransform) | Media | `angle`, `centerX`, `centerY` |  |  |
| [`Run`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.documents.run) | Documents | `flowDirection`, `text` |  | yes |
| [`ScaleTransform`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.scaletransform) | Media | `centerX`, `centerY`, `scaleX`, `scaleY` |  |  |
| [`ScrollBar`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.scrollbar) | Controls.Primitives | `indicatorMode`, `orientation`, `viewportSize` | `value` |  |
| [`ScrollContentPresenter`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.scrollcontentpresenter) | Controls | `canContentRenderOutsideBounds`, `canHorizontallyScroll`, `canVerticallyScroll`, `scrollOwner`, `sizesContentToTemplatedParent` |  | yes |
| [`ScrollPresenter`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.scrollpresenter) | Controls.Primitives | `background`, `content`, `contentOrientation`, `horizontalAnchorRatio`, `horizontalScrollChainMode`, `horizontalScrollController`, `horizontalScrollMode`, `horizontalScrollRailMode`, +10 more | `state` |  |
| [`ScrollView`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.scrollview) | Controls | `content`, `contentOrientation`, `horizontalAnchorRatio`, `horizontalScrollBarVisibility`, `horizontalScrollChainMode`, `horizontalScrollMode`, `horizontalScrollRailMode`, `ignoredInputKinds`, +9 more | `extentHeight`, `extentWidth`, `horizontalOffset`, `state`, `verticalOffset`, `zoomFactor` |  |
| [`ScrollViewer`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.scrollviewer) | Controls | `bringIntoViewOnFocusChange`, `canContentRenderOutsideBounds`, `horizontalAnchorRatio`, `horizontalScrollBarVisibility`, `horizontalScrollMode`, `horizontalSnapPointsAlignment`, `horizontalSnapPointsType`, `isDeferredScrollingEnabled`, +20 more | `horizontalOffset`, `verticalOffset`, `zoomFactor` | yes |
| [`SelectorBar`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.selectorbar) | Controls | `selectedItem` | `selectedItem` |  |
| [`SelectorBarItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.selectorbaritem) | Controls | `icon`, `text` |  |  |
| [`SemanticZoom`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.semanticzoom) | Controls | `canChangeViews`, `isZoomedInViewActive`, `isZoomOutButtonEnabled`, `zoomedInView`, `zoomedOutView` |  | yes |
| [`Setter`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.setter) | Microsoft.UI.Xaml | `value` |  |  |
| [`SineEase`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.sineease) | Media.Animation |  |  |  |
| [`SkewTransform`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.skewtransform) | Media | `angleX`, `angleY`, `centerX`, `centerY` |  |  |
| [`SlideNavigationTransitionInfo`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.slidenavigationtransitioninfo) | Media.Animation | `effect` |  |  |
| [`Slider`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.slider) | Controls | `header`, `headerTemplate`, `intermediateValue`, `isDirectionReversed`, `isThumbToolTipEnabled`, `orientation`, `snapsTo`, `stepFrequency`, +3 more | `value` |  |
| [`SoftwareBitmapSource`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.imaging.softwarebitmapsource) | Media.Imaging |  |  |  |
| [`SolidColorBrush`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.solidcolorbrush) | Media | `color` |  | yes |
| [`Span`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.documents.span) | Documents | `inlines` |  | yes |
| [`SplineColorKeyFrame`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.splinecolorkeyframe) | Media.Animation | `keySpline` |  |  |
| [`SplineDoubleKeyFrame`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.splinedoublekeyframe) | Media.Animation | `keySpline` |  |  |
| [`SplinePointKeyFrame`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.splinepointkeyframe) | Media.Animation | `keySpline` |  |  |
| [`SplitButton`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.splitbutton) | Controls | `command`, `commandParameter`, `flyout` |  | yes |
| [`SplitCloseThemeAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.splitclosethemeanimation) | Media.Animation | `closedLength`, `closedTarget`, `closedTargetName`, `contentTarget`, `contentTargetName`, `contentTranslationDirection`, `contentTranslationOffset`, `offsetFromCenter`, +3 more |  |  |
| [`SplitMenuFlyoutItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.splitmenuflyoutitem) | Controls | `subMenuItemStyle`, `subMenuPresenterStyle` |  | yes |
| [`SplitOpenThemeAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.splitopenthemeanimation) | Media.Animation | `closedLength`, `closedTarget`, `closedTargetName`, `contentTarget`, `contentTargetName`, `contentTranslationDirection`, `contentTranslationOffset`, `offsetFromCenter`, +3 more |  |  |
| [`SplitView`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.splitview) | Controls | `compactPaneLength`, `content`, `displayMode`, `isPaneOpen`, `lightDismissOverlayMode`, `openPaneLength`, `pane`, `paneBackground`, +1 more | `isPaneOpen` | yes |
| [`StackLayout`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.stacklayout) | Controls | `orientation`, `spacing` |  |  |
| [`StackPanel`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.stackpanel) | Controls | `areScrollSnapPointsRegular`, `backgroundSizing`, `borderBrush`, `borderThickness`, `cornerRadius`, `orientation`, `padding`, `spacing` |  | yes |
| [`StandardUICommand`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.input.standarduicommand) | Input | `kind` |  |  |
| [`StateTrigger`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.statetrigger) | Microsoft.UI.Xaml | `isActive` |  |  |
| [`Storyboard`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.storyboard) | Media.Animation |  |  | yes |
| [`SuppressNavigationTransitionInfo`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.suppressnavigationtransitioninfo) | Media.Animation |  |  |  |
| [`SvgImageSource`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.imaging.svgimagesource) | Media.Imaging | `rasterizePixelHeight`, `rasterizePixelWidth`, `uriSource` |  |  |
| [`SwapChainPanel`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.swapchainpanel) | Controls |  |  | yes |
| [`SwipeBackThemeAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.swipebackthemeanimation) | Media.Animation | `fromHorizontalOffset`, `fromVerticalOffset`, `targetName` |  |  |
| [`SwipeControl`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.swipecontrol) | Controls | `bottomItems`, `leftItems`, `rightItems`, `topItems` |  | yes |
| [`SwipeHintThemeAnimation`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.animation.swipehintthemeanimation) | Media.Animation | `targetName`, `toHorizontalOffset`, `toVerticalOffset` |  |  |
| [`SwipeItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.swipeitem) | Controls | `background`, `behaviorOnInvoked`, `command`, `commandParameter`, `foreground`, `iconSource`, `text` |  |  |
| [`SwipeItems`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.swipeitems) | Controls | `mode` |  | yes |
| [`SymbolIcon`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.symbolicon) | Controls | `symbol` |  |  |
| [`SymbolIconSource`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.symboliconsource) | Controls | `symbol` |  |  |
| [`SystemBackdropElement`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.systembackdropelement) | Controls | `cornerRadius`, `systemBackdrop` |  |  |
| [`TabView`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.tabview) | Controls | `addTabButtonCommand`, `addTabButtonCommandParameter`, `allowDropTabs`, `canDragTabs`, `canReorderTabs`, `canTearOutTabs`, `closeButtonOverlayMode`, `isAddTabButtonVisible`, +10 more | `selectedIndex`, `selectedItem` |  |
| [`TabViewItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.tabviewitem) | Controls | `header`, `headerTemplate`, `iconSource`, `isClosable` |  | yes |
| [`TabViewListView`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.tabviewlistview) | Controls.Primitives |  | `selectedIndex`, `selectedItem`, `selectedValue` | yes |
| [`TeachingTip`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.teachingtip) | Controls | `actionButtonCommand`, `actionButtonCommandParameter`, `actionButtonContent`, `actionButtonStyle`, `closeButtonCommand`, `closeButtonCommandParameter`, `closeButtonContent`, `closeButtonStyle`, +12 more | `isOpen` | yes |
| [`TextBlock`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.textblock) | Controls | `characterSpacing`, `fontFamily`, `fontSize`, `fontStretch`, `fontStyle`, `fontWeight`, `foreground`, `horizontalTextAlignment`, +17 more | `isTextTrimmed` | yes |
| [`TextBox`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.textbox) | Controls | `acceptsReturn`, `characterCasing`, `description`, `desiredCandidateWindowAlignment`, `header`, `headerTemplate`, `horizontalTextAlignment`, `inputScope`, +18 more | `selectionLength`, `selectionStart`, `text` |  |
| [`TextCommandBarFlyout`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.textcommandbarflyout) | Controls |  | `open` |  |
| [`TextHighlighter`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.documents.texthighlighter) | Documents | `background`, `foreground` |  |  |
| [`ThemeShadow`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.themeshadow) | Media |  |  |  |
| [`Thumb`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.thumb) | Controls.Primitives |  |  |  |
| [`TickBar`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.tickbar) | Controls.Primitives | `fill` |  |  |
| [`TimePicker`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.timepicker) | Controls | `clockIdentifier`, `header`, `headerTemplate`, `lightDismissOverlayMode`, `minuteIncrement`, `selectedTime`, `time` | `selectedTime`, `time` | yes |
| [`TimePickerFlyout`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.timepickerflyout) | Controls | `clockIdentifier`, `minuteIncrement`, `time` | `open` |  |
| [`TitleBar`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.titlebar) | Controls | `autoRefreshDragRegions`, `content`, `iconSource`, `isBackButtonEnabled`, `isBackButtonVisible`, `isPaneToggleButtonVisible`, `leftHeader`, `rightHeader`, +2 more |  |  |
| [`ToggleButton`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.primitives.togglebutton) | Controls.Primitives | `isChecked`, `isThreeState` | `isChecked` | yes |
| [`ToggleMenuFlyoutItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.togglemenuflyoutitem) | Controls | `isChecked` |  | yes |
| [`ToggleSplitButton`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.togglesplitbutton) | Controls | `isChecked` | `isChecked` | yes |
| [`ToggleSwitch`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.toggleswitch) | Controls | `header`, `headerTemplate`, `isOn`, `offContent`, `offContentTemplate`, `onContent`, `onContentTemplate` | `isOn` | yes |
| [`ToolTip`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.tooltip) | Controls | `horizontalOffset`, `isOpen`, `placement`, `placementRect`, `placementTarget`, `verticalOffset` | `isOpen` | yes |
| [`TransformGroup`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.transformgroup) | Media |  |  | yes |
| [`TranslateTransform`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.media.translatetransform) | Media | `x`, `y` |  |  |
| [`TreeView`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.treeview) | Controls | `canDragItems`, `canReorderItems`, `itemContainerStyle`, `itemContainerStyleSelector`, `itemsSource`, `itemTemplate`, `itemTemplateSelector`, `selectedItem`, +2 more | `selectedKey`, `selectedKeys`, `expandedKeys` |  |
| [`TreeViewItem`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.treeviewitem) | Controls | `collapsedGlyph`, `expandedGlyph`, `glyphBrush`, `glyphOpacity`, `glyphSize`, `hasUnrealizedChildren`, `isExpanded`, `itemsSource` |  | yes |
| [`TreeViewList`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.treeviewlist) | Controls |  | `selectedIndex`, `selectedItem`, `selectedValue` | yes |
| [`TreeViewNode`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.treeviewnode) | Controls | `content`, `hasUnrealizedChildren`, `isExpanded` |  |  |
| [`TwoPaneView`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.twopaneview) | Controls | `minTallModeHeight`, `minWideModeWidth`, `pane1`, `pane1Length`, `pane2`, `pane2Length`, `panePriority`, `tallModeConfiguration`, +1 more | `mode` |  |
| [`Underline`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.documents.underline) | Documents |  |  | yes |
| [`UniformGridLayout`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.uniformgridlayout) | Controls | `itemsJustification`, `itemsStretch`, `maximumRowsOrColumns`, `minColumnSpacing`, `minItemHeight`, `minItemWidth`, `minRowSpacing`, `orientation` |  |  |
| [`UserControl`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.usercontrol) | Controls | `content` |  | yes |
| [`VariableSizedWrapGrid`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.variablesizedwrapgrid) | Controls | `horizontalChildrenAlignment`, `itemHeight`, `itemWidth`, `maximumRowsOrColumns`, `orientation`, `verticalChildrenAlignment` |  | yes |
| [`Viewbox`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.viewbox) | Controls | `child`, `stretch`, `stretchDirection` |  | yes |
| [`VirtualizingLayout`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.virtualizinglayout) | Controls |  |  |  |
| [`VirtualizingStackPanel`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.virtualizingstackpanel) | Controls | `areScrollSnapPointsRegular`, `orientation` |  | yes |
| [`VisualState`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.visualstate) | Microsoft.UI.Xaml | `storyboard` |  | yes |
| [`VisualStateGroup`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.visualstategroup) | Microsoft.UI.Xaml |  |  | yes |
| [`VisualTransition`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.visualtransition) | Microsoft.UI.Xaml | `from`, `generatedDuration`, `generatedEasingFunction`, `storyboard`, `to` |  | yes |
| [`WebView2`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.webview2) | Controls | `canGoBack`, `canGoForward`, `defaultBackgroundColor`, `source` |  |  |
| [`WrapGrid`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.wrapgrid) | Controls | `horizontalChildrenAlignment`, `itemHeight`, `itemWidth`, `maximumRowsOrColumns`, `orientation`, `verticalChildrenAlignment` |  | yes |
| [`XamlUICommand`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.input.xamluicommand) | Input | `accessKey`, `command`, `description`, `iconSource`, `label` |  |  |
| [`CanvasAnimatedControl`](https://microsoft.github.io/Win2D/WinUI3/html/T_Microsoft_Graphics_Canvas_UI_Xaml_CanvasAnimatedControl.htm) | Microsoft.Graphics.Canvas.UI.Xaml | `clearColor`, `customDevice`, `dpiScale`, `forceSoftwareRenderer`, `isFixedTimeStep`, `paused`, `syncInterval`, `targetElapsedTime`, +1 more |  | yes |
| [`CanvasControl`](https://microsoft.github.io/Win2D/WinUI3/html/T_Microsoft_Graphics_Canvas_UI_Xaml_CanvasControl.htm) | Microsoft.Graphics.Canvas.UI.Xaml | `clearColor`, `customDevice`, `dpiScale`, `forceSoftwareRenderer`, `useSharedDevice` |  | yes |
| [`CanvasSwapChainPanel`](https://microsoft.github.io/Win2D/WinUI3/html/T_Microsoft_Graphics_Canvas_UI_Xaml_CanvasSwapChainPanel.htm) | Microsoft.Graphics.Canvas.UI.Xaml | `swapChain` |  | yes |
| [`CanvasVirtualControl`](https://microsoft.github.io/Win2D/WinUI3/html/T_Microsoft_Graphics_Canvas_UI_Xaml_CanvasVirtualControl.htm) | Microsoft.Graphics.Canvas.UI.Xaml | `clearColor`, `customDevice`, `dpiScale`, `forceSoftwareRenderer`, `useSharedDevice` |  | yes |

<!-- controls:end -->

How a value is written:

- An enum prop takes the member's WinUI name (`horizontalAlignment="Center"`)
  or its value (`HorizontalAlignment.Center` from `winui-svelte/enums`), and
  nothing else, so the editor offers exactly the members; a flag enum also
  takes a list of names (`modifiers={["Control", "Shift"]}`)
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
[API.md](API.md) has the details

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
complete it; [API.md](API.md) has the details, and `examples/navigation` ties
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
[API.md](API.md) has the details, what is supported and what is not, and `examples/win2d` the example

The raw elements the components are made of work too:
`<stack-panel spacing={8}>`, `<text-block>`, `grid.column={1}` for an attached property; they need
`registerControls(...)` with the classes they name (a component registers only
its own class, when it is made, so an app bundles only the bindings it uses)
Components are the supported way; see [API.md](API.md) for the raw forms and
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
[API.md](API.md#media-winui-sveltemedia) has the formats WinUI decodes and the
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
  <TextBlock text="Battery {power.hasBattery ? `${power.percent}%` : "none"}" />
  {#each speakers.devices.items as device (device.id)}
    <TextBlock text={device.name} />
  {/each}
  {#each installed.printers as printer (printer.name)}
    <TextBlock text="{printer.name}{printer.isOffline ? " (offline)" : ""}" />
  {/each}
</StackPanel>
```

Every list is a keyed collection, every value a getter that re-runs when
Windows says it changed, and every watcher stops with its component
What does not work unpackaged (`MouseDevice`, the print dialog of
`PrintManager`, geolocation) and the failure modes are in
[`API.md`](API.md#windows-devices-winui-sveltedevices)

## Styling with CSS

`<style>` blocks are translated at build time into WinUI `Style`s and applied
by class, so a card is `class="card"` and a rule, as on the web
Layout
properties map onto WinUI's panels
A declaration with no WinUI meaning is a
build error with its file and line; nothing is silently ignored
[`src/css/API.md`](src/css/API.md) is the interface; what maps:

| CSS | WinUI |
| --- | --- |
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

A prop and a rule that set the same WinUI property both work, and the prop
wins: `<TextBlock isTextSelectionEnabled={false}>` stays false under
`user-select: text`, and a rule fills in where the prop is absent
(`padding`, `gap` and `font-size` the same)
This is the reverse of the web's presentation attributes, on purpose: the prop
is the direct, local value
An animation still overrides a local value while it runs, as on the web

`style:` and `class:` directives work on component instances too
`<TextBlock style:padding="{p}px" class:active={isActive}>` is rewritten at
build time into a `style` string and a `class` array that stay reactive;
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
[API.md](API.md) has the rest: what each `*Style` prop styles, `xamlOf`, and
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
  <border padding="16" transition:fly={{ y: 40, duration: 300 }}>
    <text-block>Hello</text-block>
  </border>
{/if}
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
[API.md](API.md) for the details and what WinUI cannot do

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
See [API.md](API.md) and [src/css/API.md](src/css/API.md) for every media
feature and what each one is answered from

## State

Svelte's own state tools work unchanged (runes, context, `SvelteMap`, stores)
The package adds `winui-svelte/state`: `createHostChannel(transport)`,
`hostState<View>(channel, "view")` and `channel.send(action)`, for state a Tauri
core, an Electron main process or a script owns
A host written in JavaScript
imports `winui-svelte/state/host` (`diff`, the transports, the message types),
which loads in plain Node
[`src/state/README.md`](src/state/README.md) has the
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
  <text-block text="Drop a text file"></text-block>
</border>

<Button {@attach filePicker({ accept: "image/*", multiple: true, onPick: files => (names = files.map(file => file.name)) })}>
  Choose
</Button>
<Button onclick={() => clipboard.writeText("copied")}>Copy</Button>
<Button onclick={() => launchUri("https://example.com")}>Open</Button>
```

Dragging out (`ondragstart`, `draggable({ files })`), the `drag` event, the
clipboard's HTML, files and pictures, `pickSaveFile`, `revealInExplorer` and the
share pane are in [API.md](API.md#data-transfer-winui-sveltedata-transfer)
Unpackaged apps cannot open the share pane (it needs a package identity) and
get no scheme handler list from the launcher; everything else on this page runs
from `node.exe`
Raw elements take the web names after `enableDragEvents()`; components take the
attachments, because a component prop would pull this code into every app

## Entry points

| Specifier | What |
| --- | --- |
| `winui-svelte` | `control`, `withControl`, `mountControl`, `registerControls`, `dispatch` / `flush`, the value helpers |
| `winui-svelte/components` | every control as a component, and its props type; `xamlOf`, `goToState`, `installXaml` |
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
| `winui-svelte/element-effects` | `enableElementEffects` (the Vite plugin calls it from a component that imports `blur` or `draw`): the blur transition blurs for real and `draw` measures a `path`, with Composition and Win2D |
| `winui-svelte/app` | single-instance handling over a named pipe, and app notifications |
| `winui-svelte/data-transfer` | web-shaped drag and drop, `NativeFile`, pickers, the clipboard and the launcher (opt-in) |
| `winui-svelte/media` | `bitmapImageOf`, `svgImageSourceOf`, `createMediaPlayer`: image sources and a windowless `MediaPlayer` (opt-in; [`API.md`](API.md#media-winui-sveltemedia)) |
| `winui-svelte/tray` | `TrayIcon`, `createTrayIcon`, `hideToTray`: a notification-area icon (opt-in; [`API.md`](API.md#system-tray-winui-sveltetray)) |
| `winui-svelte/forms` | `Form`, `FormField` and the attachments that join a control to a form by name, with HTML's constraint validation and zod (opt-in; [`API.md`](API.md#forms-winui-svelteforms)) |
| `winui-svelte/devices`, `/devices/enumeration`, `/devices/input`, `/devices/bluetooth`, `/devices/printers`, `/devices/power`, `/devices/network`, `/devices/audio`, `/devices/display`, `/devices/gamepad`, `/devices/sensors` | device enumeration, input devices, Bluetooth, printers, power, network, displays, audio, gamepads, sensors: Windows' own device APIs as runes (opt-in; [`API.md`](API.md#windows-devices-winui-sveltedevices)) |
| `winui-svelte/connected-animation` | `connectElement` and `startConnected`, WinUI's connected animation between pages |
| `winui-svelte/css/transform`, `/css/animation`, `/css/effects`, `/css/filter`, `/css/clip`, `/css/focus`, `/css/surface`, `/css/position`, `/css/container`, `/css/queries`, `/css/environment`, `/css/compat`, `/css/resources` | the opt-in CSS groups: 2D transform, animations, aspect ratio, filters and masks, clip shapes, focus visuals, surfaces, position and inset, media and container queries, media preferences and display features, browser-stylesheet properties, theme resources ([`src/css/API.md`](src/css/API.md)) |
| `winui-svelte/css`, `/css/vite`, `/css/sheet-module`, `/css/gradients` | the CSS runtime, its Vite plugin, the sheet module compiler and the gradient parser a sheet with a gradient imports ([`src/css/API.md`](src/css/API.md)) |
| `winui-svelte/preprocess`, `winui-svelte/stylelint`, `winui-svelte/vscode-css-data.json` | the editor side of the CSS: a Svelte preprocessor, a stylelint rule and VS Code custom data, all from the same validator and tables, so the editor, the linter and the build say the same thing ([`src/css/API.md`](src/css/API.md#diagnostics-in-the-editor-the-linter-and-the-build)) |

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

An app with one `Button` bundles to under 123,000 bytes (the budget the
bundle test enforces; `pnpm test` fails when it grows), because the package is
tree-shakeable: a consumer that imports `Button` does not bundle
`NavigationView`

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
- **No `WriteableBitmap` component.** The bindings hold no `WriteableBitmap`;
  `RenderTargetBitmap`, `SoftwareBitmapSource` and `BitmapImage` are there
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
- **CSS is WinUI's subset.** No `position`, `float`, `flex-grow`, `box-shadow`
- **CSS is WinUI's subset.** Layout follows the element's type (`src/css/API.md`
  has the table): `display: flex` is a `<stack-panel>`, `display: grid` a
  `<grid>` (tracks in `fr`, `px`, `auto`, `minmax()`), `position: absolute` a
  `<canvas>` child, `@media (min-width...)` restyles as the window resizes, and descendant, child
  and sibling selectors, `:first-child`, `:nth-child()` and `:is()` are resolved
  against the component's markup at build time
  A Style cannot reach an element's parent, children or siblings, so these are
  build errors that say what to write instead: `float`, `position: sticky`,
  `right` and `bottom`, `flex-wrap` (WinUI has no wrapping panel), `aspect-ratio`, a % size other than
  100%, `calc()` with a % or a variable, any unit but px, deg, s, ms and fr, container style queries, `:has()`, `:focus-within`,
  `box-shadow` (use `-winui-elevation`), `clip-path` as
  `rect()` or `xywh()`, `mask-position`, `mask-size`, `mask-repeat` and `url()`
  filters
  A container's `align-items`, `justify-content`, `place-items`, its children's
  `flex-grow`, `flex-basis` and `order`, and `display: flex` on a `<grid>` are
  lowered at build time into generated classes on the children (and the
  children are written in `order`), so they work where the markup fixes the
  children (`src/css/API.md`, Containers); `text-transform` shows the text
  changed and keeps the source text; a `transition` on `border-color` runs a
  color animation on the border brush
  `cursor` is ignored with a warning: `InputSystemCursor` and
  `InputSystemCursorShape` (Microsoft.UI.Input) are not in the bindings, and
  `ProtectedCursor` takes only one of those
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

| | |
| --- | --- |
| `pnpm test` | the unit tests, the generator's tests, and the mount test: every component made and linked in a real WinUI window that opens off screen and never takes focus |
| `pnpm lint` | every check: oxlint, ESLint (Google TypeScript style), `tsc`, `svelte-check`, the editor check, fallow, the check that the generated files are current and the tarball check; `pnpm lint:summary` counts the violations per rule and folder |
| `pnpm gen:components` | regenerates the components, their metadata, the class list the bindings are generated for and the tables and quick start in this README from WinUI's metadata (`pnpm restore` first) |
| `pnpm bindings` | the WinUI bindings (winapp's run, then the WebView2 step); [CONTRIBUTING.md](CONTRIBUTING.md) says when |
| `pnpm build` | `dist/`: what is published (`pnpm pack` shows the tarball) |
| `pwsh examples/hello/run.ps1` | the hello example in a background window, checked through UI Automation (`-Edit` also checks hot reload) |

[DESIGN.md](DESIGN.md) is the architecture and [API.md](API.md) the core API

## License

[Apache-2.0](LICENSE)
Copyright 2026 [Avi](https://avi12.com)
Copies and forks
must keep the `LICENSE` and the `NOTICE` file, which carries this credit
(Apache-2.0, section 4), so it travels with the code
