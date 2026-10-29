# winui-svelte

WinUI 3 controls as Svelte components: native Windows apps written in Svelte,
the way React Native writes native apps in React. Every control is WinUI's own,
so the app looks and behaves like Windows: light and dark follow Windows, the
controls animate and are accessible as WinUI makes them, and acrylic is a real
backdrop. No browser engine is involved; there is no DOM.

```svelte
<script lang="ts">
  import { StackPanel, TextBlock, ToggleSwitch } from "winui-svelte/components";

  let isOn = $state(true);
</script>

<StackPanel padding={24} spacing={12}>
  <TextBlock text="Hello from WinUI" fontSize={24} />
  <ToggleSwitch bind:isOn header="Lights" />
</StackPanel>
```

- **Every WinUI 3 control, and the value objects they take** (brushes,
  transforms, animations, layouts...: 295 components in the table below) are
  generated from WinUI's own metadata, with typed props, typed events and
  `bind:`-able properties. The package follows WinUI instead of a hand-picked
  subset; lists (`ListView`, `GridView`...) are generated too.
- **Svelte's own compiler and runtime**, through its custom-renderer API.
  Runes, context, `{#if}`, `{#each}`, snippets, `svelte/reactivity` and stores
  work as they do on the web.
- **Hot reload** while you develop: save a `.svelte` file and the open window
  changes in place.
- **Framework-agnostic.** The window runs in a Node process (with a worker for
  WinUI's UI thread) that something else starts: a Tauri core, an Electron
  main process, or you from a terminal. The host and the window talk in JSON
  lines (or a `MessagePort` in-process).
- **Windows only.** Windows 10 version 1809 (build 17763) and Windows 11, on
  the Windows App SDK (WinUI 3) through [dynwinrt](https://github.com/microsoft/dynwinrt).

Built for [Edge+](https://github.com/avi12/edge-plus), whose settings panel is
written with it.

> **Status: pre-release.** The custom-renderer API the package needs is a
> Svelte pull request that has not shipped
> ([sveltejs/svelte#18042](https://github.com/sveltejs/svelte/pull/18042)), and
> `svelte` is installed from a pkg.pr.new build until it does. **No stable
> release can go out before Svelte ships that API and `svelte` is pinned to a
> published version** (see [CONTRIBUTING.md](CONTRIBUTING.md#the-svelte-build)).
> What is described here is what the repository's tests and the
> [hello example](examples/hello) run. See [CHANGELOG.md](CHANGELOG.md).

## Requirements

| | |
| --- | --- |
| OS | Windows 10 1809 (17763) or newer, Windows 11 |
| Node | 24 or newer |
| Windows App SDK runtime | 2.2, installed on the machine. A missing runtime makes `initWindowsAppSdk` throw `WindowsAppRuntimeMissing`; the package does not install it (your app ships the installer and offers it) |
| Svelte | the build with the custom-renderer API: `svelte@https://pkg.pr.new/svelte@18042` until it is released |
| Vite | 8 (for the dev server and hot reload) |

## Install

```sh
pnpm add winui-svelte
```

The WinUI bindings, the Windows App SDK bootstrapper and the Vite plugin come
with it.

## Quick start

The files below are the [hello example](examples/hello), run for real by
`examples/hello/run.ps1` (it flips the switch through UI Automation and edits
`App.svelte` to check hot reload).

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

`App.svelte` is the window's content. `bind:isOn` works on the component like any
Svelte binding:

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

<!-- Global: Svelte does not scope a class passed to a component. -->
<style>
  :global(.hello) {
    gap: 12px;
    padding: 24px;
  }

  :global(.title) {
    font-size: 24px;
  }
</style>
```

<!-- hello/App.svelte:end -->

`window.ts` runs on the UI thread. WinUI's message loop never gives its thread
back, so `runOnUiThread` (the package's `/thread` entry) is a worker's first
call: it enters the apartment before anything creates a WinRT object. The
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

Edit the text in `App.svelte` and save: the window follows within a moment.
Set `WINUI_SVELTE_BACKGROUND=1` to open the window without taking focus (for
scripts and captures).

State changes need no `flushSync`: the window's loop is started with
`Application.startScheduled`, so Node drains microtasks after each WinUI
callback and Svelte's own flush runs ([experiment](examples/scheduling/README.md)).

## Host integration

The window is a process (or a worker) that something else owns. What the host
sends and receives is the same everywhere: JSON values, one per line on stdio,
or the same objects through a `MessagePort`. State the host owns reaches the
window as one deeply reactive object, and the window answers with actions; see
[`src/state/README.md`](src/state/README.md) for the wire protocol, `hostState`
and `send`.

**Tauri** (what [Edge+](https://github.com/avi12/edge-plus) does). The Rust core starts the window as a child process
(a sidecar: your `main.ts`, or a bundled executable with Node inside) with its
stdin and stdout piped, writes request lines (`{"id":1,"type":"snapshot","data":{"name":"view","value":{...}},"timestamp":...}`)
and later `patch` ones, and reads `action` requests back, answering each with a
response line (`{"id":1,"response":null}` or `{"id":1,"error":"..."}`). In the window, `createStdioTransport()` and `reserveStdout()` (so a
stray `console.log` goes to stderr and cannot corrupt the protocol) are the
other end. Edge+'s `app/panel-tauri` (`ui/main.ts`, with the core in
`src-tauri`) is the working example.

**Electron.** The main process starts the window with
`utilityProcess.fork("main.js")` (or `child_process.spawn` of Node) and speaks
the same messages over the process's stdio or a `MessagePort`; the main
process is where the state lives and where `diff(previous, next)` from
`winui-svelte/state/host` makes the patches. The Windows App SDK is started by
the window's own process, so the Electron renderer is not involved.
This path has the same protocol as Tauri's but has not been run in this
repository.

**Node.** The simplest host is your own script: it starts the Windows App SDK
and the window as `main.ts` above does, and keeps its state in plain objects.
`examples/counter` is a host in Node that owns `{ count, history }`, sends it
with `diff()`, and answers the window's actions over a `MessagePort`
(`examples/counter/run.ps1` clicks its buttons through UI Automation).

## Controls

Every concrete WinUI 3 control, and every value object a property can take, is
a component in `winui-svelte/components`. A component has the properties of its
WinUI class and of every class it inherits from, as camelCase props (`isOn`,
`horizontalAlignment`), its events as `on...` props (`onToggled`), and `bind:`
on a property that has a matching change event. The table shows what each class
adds; `Bindable` includes the inherited bindables. `Children` says the
component takes content (its WinUI content property: `Content`, `Child`,
`Children`, `Items`...) as children.

<!-- controls:start -->

| Component | Namespace | Props it adds | Bindable | Children |
| --- | --- | --- | --- | --- |
| `AcrylicBrush` | Media | `alwaysUseFallback`, `tintColor`, `tintLuminosityOpacity`, `tintOpacity`, `tintTransitionDuration` |  |  |
| `AddDeleteThemeTransition` | Media.Animation |  |  |  |
| `AnimatedIcon` | Controls | `fallbackIconSource`, `mirroredWhenRightToLeft`, `source` |  |  |
| `AnimatedIconSource` | Controls | `fallbackIconSource`, `mirroredWhenRightToLeft`, `source` |  |  |
| `AnimatedVisualPlayer` | Controls | `animationOptimization`, `autoPlay`, `fallbackContent`, `playbackRate`, `source`, `stretch` |  |  |
| `AnnotatedScrollBar` | Controls | `detailLabelTemplate`, `labels`, `labelTemplate`, `smallChange` |  |  |
| `AppBar` | Controls | `closedDisplayMode`, `isOpen`, `isSticky`, `lightDismissOverlayMode` | `isOpen` | yes |
| `AppBarButton` | Controls | `dynamicOverflowOrder`, `icon`, `isCompact`, `keyboardAcceleratorTextOverride`, `label`, `labelPosition` |  | yes |
| `AppBarElementContainer` | Controls | `dynamicOverflowOrder`, `isCompact` |  | yes |
| `AppBarSeparator` | Controls | `dynamicOverflowOrder`, `isCompact` |  |  |
| `AppBarToggleButton` | Controls | `dynamicOverflowOrder`, `icon`, `isCompact`, `keyboardAcceleratorTextOverride`, `label`, `labelPosition` | `isChecked` | yes |
| `ArcSegment` | Media | `isLargeArc`, `point`, `rotationAngle`, `size`, `sweepDirection` |  |  |
| `AutoSuggestBox` | Controls | `autoMaximizeSuggestionArea`, `description`, `header`, `isSuggestionListOpen`, `lightDismissOverlayMode`, `maxSuggestionListHeight`, `placeholderText`, `queryIcon`, +4 more | `text` | yes |
| `BackEase` | Media.Animation | `amplitude` |  |  |
| `BezierSegment` | Media | `point1`, `point2`, `point3` |  |  |
| `BitmapCache` | Media |  |  |  |
| `BitmapIcon` | Controls | `showAsMonochrome`, `uriSource` |  |  |
| `BitmapIconSource` | Controls | `showAsMonochrome`, `uriSource` |  |  |
| `BitmapImage` | Media.Imaging | `autoPlay`, `createOptions`, `decodePixelHeight`, `decodePixelType`, `decodePixelWidth`, `uriSource` |  |  |
| `Bold` | Documents |  |  | yes |
| `Border` | Controls | `background`, `backgroundSizing`, `backgroundTransition`, `borderBrush`, `borderThickness`, `child`, `cornerRadius`, `padding` |  | yes |
| `BounceEase` | Media.Animation | `bounces`, `bounciness` |  |  |
| `BreadcrumbBar` | Controls | `itemsSource`, `itemTemplate` |  |  |
| `BreadcrumbBarItem` | Controls |  |  | yes |
| `Button` | Controls | `flyout` |  | yes |
| `CalendarDatePicker` | Controls | `calendarIdentifier`, `calendarViewStyle`, `date`, `dateFormat`, `dayOfWeekFormat`, `description`, `displayMode`, `firstDayOfWeek`, +10 more | `date` |  |
| `CalendarPanel` | Controls.Primitives |  |  | yes |
| `CalendarView` | Controls | `blackoutBackground`, `blackoutForeground`, `blackoutStrikethroughBrush`, `calendarIdentifier`, `calendarItemBackground`, `calendarItemBorderBrush`, `calendarItemBorderThickness`, `calendarItemCornerRadius`, +65 more |  |  |
| `CalendarViewDayItem` | Controls | `isBlackout` |  |  |
| `Canvas` | Controls |  |  | yes |
| `CarouselPanel` | Controls.Primitives | `canHorizontallyScroll`, `canVerticallyScroll`, `scrollOwner` |  | yes |
| `CheckBox` | Controls |  | `isChecked` | yes |
| `CircleEase` | Media.Animation |  |  |  |
| `ColorAnimation` | Media.Animation | `by`, `easingFunction`, `enableDependentAnimation`, `from`, `to` |  |  |
| `ColorAnimationUsingKeyFrames` | Media.Animation | `enableDependentAnimation` |  | yes |
| `ColorPicker` | Controls | `color`, `colorSpectrumComponents`, `colorSpectrumShape`, `isAlphaEnabled`, `isAlphaSliderVisible`, `isAlphaTextInputVisible`, `isColorChannelTextInputVisible`, `isColorPreviewVisible`, +12 more | `color` |  |
| `ColorPickerSlider` | Controls.Primitives | `colorChannel` | `value` |  |
| `ColorSpectrum` | Controls.Primitives | `color`, `components`, `hsvColor`, `maxHue`, `maxSaturation`, `maxValue`, `minHue`, `minSaturation`, +2 more | `color` |  |
| `ColumnMajorUniformToLargestGridLayout` | Controls.Primitives | `columnSpacing`, `maxColumns`, `rowSpacing` |  |  |
| `ComboBox` | Controls | `description`, `header`, `headerTemplate`, `isDropDownOpen`, `isEditable`, `isTextSearchEnabled`, `lightDismissOverlayMode`, `maxDropDownHeight`, +5 more | `selectedIndex`, `selectedItem`, `selectedValue`, `isDropDownOpen` | yes |
| `ComboBoxItem` | Controls |  |  | yes |
| `CommandBar` | Controls | `commandBarOverflowPresenterStyle`, `defaultLabelPosition`, `isDynamicOverflowEnabled`, `overflowButtonVisibility` | `isOpen` | yes |
| `CommandBarFlyout` | Controls | `alwaysExpanded` | `open` |  |
| `CommandBarFlyoutCommandBar` | Controls.Primitives | `systemBackdrop` | `isOpen` | yes |
| `CommandBarOverflowPresenter` | Controls |  |  | yes |
| `CommonNavigationTransitionInfo` | Media.Animation | `isStaggeringEnabled` |  |  |
| `CompositeTransform` | Media | `centerX`, `centerY`, `rotation`, `scaleX`, `scaleY`, `skewX`, `skewY`, `translateX`, +1 more |  |  |
| `CompositeTransform3D` | Media.Media3D | `centerX`, `centerY`, `centerZ`, `rotationX`, `rotationY`, `rotationZ`, `scaleX`, `scaleY`, +4 more |  |  |
| `ContentControl` | Controls | `content`, `contentTemplate`, `contentTemplateSelector` |  | yes |
| `ContentDialog` | Controls | `closeButtonCommand`, `closeButtonCommandParameter`, `closeButtonStyle`, `closeButtonText`, `defaultButton`, `fullSizeDesired`, `isPrimaryButtonEnabled`, `isSecondaryButtonEnabled`, +10 more | `open` | yes |
| `ContentPresenter` | Controls | `background`, `backgroundSizing`, `backgroundTransition`, `borderBrush`, `borderThickness`, `characterSpacing`, `content`, `contentTemplate`, +18 more |  | yes |
| `ContentThemeTransition` | Media.Animation | `horizontalOffset`, `verticalOffset` |  |  |
| `ContinuumNavigationTransitionInfo` | Media.Animation | `exitElement` |  |  |
| `CubicEase` | Media.Animation |  |  |  |
| `DatePicker` | Controls | `calendarIdentifier`, `date`, `dayFormat`, `dayVisible`, `header`, `headerTemplate`, `lightDismissOverlayMode`, `maxYear`, +7 more | `date`, `selectedDate` | yes |
| `DatePickerFlyout` | Controls | `calendarIdentifier`, `date`, `dayFormat`, `dayVisible`, `maxYear`, `minYear`, `monthFormat`, `monthVisible`, +2 more | `open` |  |
| `DesktopAcrylicBackdrop` | Media |  |  |  |
| `DiscreteColorKeyFrame` | Media.Animation |  |  |  |
| `DiscreteDoubleKeyFrame` | Media.Animation |  |  |  |
| `DiscreteObjectKeyFrame` | Media.Animation |  |  |  |
| `DiscretePointKeyFrame` | Media.Animation |  |  |  |
| `DoubleAnimation` | Media.Animation | `by`, `easingFunction`, `enableDependentAnimation`, `from`, `to` |  |  |
| `DoubleAnimationUsingKeyFrames` | Media.Animation | `enableDependentAnimation` |  | yes |
| `DragItemThemeAnimation` | Media.Animation | `targetName` |  |  |
| `DragOverThemeAnimation` | Media.Animation | `direction`, `targetName`, `toOffset` |  |  |
| `DrillInNavigationTransitionInfo` | Media.Animation |  |  |  |
| `DrillInThemeAnimation` | Media.Animation | `entranceTarget`, `entranceTargetName`, `exitTarget`, `exitTargetName` |  |  |
| `DrillOutThemeAnimation` | Media.Animation | `entranceTarget`, `entranceTargetName`, `exitTarget`, `exitTargetName` |  |  |
| `DropDownButton` | Controls |  |  | yes |
| `DropTargetItemThemeAnimation` | Media.Animation | `targetName` |  |  |
| `EasingColorKeyFrame` | Media.Animation | `easingFunction` |  |  |
| `EasingDoubleKeyFrame` | Media.Animation | `easingFunction` |  |  |
| `EasingPointKeyFrame` | Media.Animation | `easingFunction` |  |  |
| `EdgeUIThemeTransition` | Media.Animation | `edge` |  |  |
| `ElasticEase` | Media.Animation | `oscillations`, `springiness` |  |  |
| `Ellipse` | Shapes |  |  |  |
| `EllipseGeometry` | Media | `center`, `radiusX`, `radiusY` |  |  |
| `EntranceNavigationTransitionInfo` | Media.Animation |  |  |  |
| `EntranceThemeTransition` | Media.Animation | `fromHorizontalOffset`, `fromVerticalOffset`, `isStaggeringEnabled` |  |  |
| `Expander` | Controls | `expandDirection`, `header`, `headerTemplate`, `headerTemplateSelector`, `isExpanded` | `isExpanded` | yes |
| `ExponentialEase` | Media.Animation | `exponent` |  |  |
| `FadeInThemeAnimation` | Media.Animation | `targetName` |  |  |
| `FadeOutThemeAnimation` | Media.Animation | `targetName` |  |  |
| `FlipView` | Controls | `useTouchAnimationsForAllNavigation` | `selectedIndex`, `selectedItem`, `selectedValue` | yes |
| `FlipViewItem` | Controls |  |  | yes |
| `Flyout` | Controls | `content`, `flyoutPresenterStyle` | `open` | yes |
| `FlyoutPresenter` | Controls | `isDefaultShadowEnabled` |  | yes |
| `FontIcon` | Controls | `fontFamily`, `fontSize`, `fontStyle`, `fontWeight`, `glyph`, `isTextScaleFactorEnabled`, `mirroredWhenRightToLeft` |  |  |
| `FontIconSource` | Controls | `fontFamily`, `fontSize`, `fontStyle`, `fontWeight`, `glyph`, `isTextScaleFactorEnabled`, `mirroredWhenRightToLeft` |  |  |
| `Frame` | Controls | `cacheSize`, `isNavigationStackEnabled`, `sourcePageType` | `backStackDepth`, `canGoBack`, `canGoForward` | yes |
| `GeometryGroup` | Media | `fillRule` |  | yes |
| `Glyphs` | Documents | `colorFontPaletteIndex`, `fill`, `fontRenderingEmSize`, `fontUri`, `indices`, `isColorFontEnabled`, `originX`, `originY`, +2 more |  |  |
| `GradientStop` | Media | `color`, `offset` |  | yes |
| `Grid` | Controls | `backgroundSizing`, `borderBrush`, `borderThickness`, `columnSpacing`, `cornerRadius`, `padding`, `rowSpacing` |  | yes |
| `GridView` | Controls |  | `selectedIndex`, `selectedItem`, `selectedValue`, `selectedKey`, `selectedKeys` | yes |
| `GridViewHeaderItem` | Controls |  |  | yes |
| `GridViewItem` | Controls |  |  | yes |
| `GridViewItemPresenter` | Controls.Primitives | `checkBrush`, `checkHintBrush`, `checkSelectingBrush`, `contentMargin`, `disabledOpacity`, `dragBackground`, `dragForeground`, `dragOpacity`, +14 more |  | yes |
| `GroupItem` | Controls |  |  | yes |
| `Hub` | Controls | `defaultSectionIndex`, `header`, `headerTemplate`, `isActiveView`, `isZoomedInView`, `orientation`, `semanticZoomOwner` |  | yes |
| `HubSection` | Controls | `contentTemplate`, `header`, `headerTemplate`, `isHeaderInteractive` |  | yes |
| `Hyperlink` | Documents | `elementSoundMode`, `isTabStop`, `navigateUri`, `tabIndex`, `underlineStyle`, `xYFocusDown`, `xYFocusDownNavigationStrategy`, `xYFocusLeft`, +5 more |  | yes |
| `HyperlinkButton` | Controls | `navigateUri` |  | yes |
| `IconSourceElement` | Controls | `iconSource` |  | yes |
| `Image` | Controls | `nineGrid`, `source`, `stretch` |  |  |
| `ImageBrush` | Media | `imageSource` |  |  |
| `ImageIcon` | Controls | `source` |  |  |
| `ImageIconSource` | Controls | `imageSource` |  |  |
| `InfoBadge` | Controls | `iconSource`, `value` |  |  |
| `InfoBar` | Controls | `actionButton`, `closeButtonCommand`, `closeButtonCommandParameter`, `closeButtonStyle`, `content`, `contentTemplate`, `iconSource`, `isClosable`, +5 more | `isOpen` |  |
| `InfoBarPanel` | Controls.Primitives | `horizontalOrientationPadding`, `verticalOrientationPadding` |  | yes |
| `InlineUIContainer` | Documents | `child` |  | yes |
| `Italic` | Documents |  |  | yes |
| `ItemContainer` | Controls | `child`, `isSelected` |  |  |
| `ItemsControl` | Controls | `displayMemberPath`, `groupStyleSelector`, `itemContainerStyle`, `itemContainerStyleSelector`, `itemsPanel`, `itemsSource`, `itemTemplate`, `itemTemplateSelector` |  | yes |
| `ItemsPresenter` | Controls | `footer`, `footerTemplate`, `header`, `headerTemplate`, `padding` |  |  |
| `ItemsRepeater` | Controls | `background`, `horizontalCacheLength`, `itemsSource`, `itemTemplate`, `itemTransitionProvider`, `layout`, `verticalCacheLength` |  |  |
| `ItemsRepeaterScrollHost` | Controls | `horizontalAnchorRatio`, `scrollViewer`, `verticalAnchorRatio` |  |  |
| `ItemsStackPanel` | Controls | `areStickyGroupHeadersEnabled`, `cacheLength`, `groupHeaderPlacement`, `groupPadding`, `itemsUpdatingScrollMode`, `orientation` |  | yes |
| `ItemsView` | Controls | `isItemInvokedEnabled`, `itemsSource`, `itemTemplate`, `itemTransitionProvider`, `layout`, `selectionMode`, `verticalScrollController` |  |  |
| `ItemsWrapGrid` | Controls | `areStickyGroupHeadersEnabled`, `cacheLength`, `groupHeaderPlacement`, `groupPadding`, `itemHeight`, `itemWidth`, `maximumRowsOrColumns`, `orientation` |  | yes |
| `KeyboardAccelerator` | Input | `isEnabled`, `key`, `modifiers`, `scopeOwner` |  |  |
| `KeySpline` | Media.Animation | `controlPoint1`, `controlPoint2` |  |  |
| `Line` | Shapes | `x1`, `x2`, `y1`, `y2` |  |  |
| `LinearColorKeyFrame` | Media.Animation |  |  |  |
| `LinearDoubleKeyFrame` | Media.Animation |  |  |  |
| `LinearGradientBrush` | Media | `endPoint`, `startPoint` |  | yes |
| `LinearPointKeyFrame` | Media.Animation |  |  |  |
| `LineBreak` | Documents |  |  |  |
| `LinedFlowLayout` | Controls | `itemsJustification`, `itemsStretch`, `lineHeight`, `lineSpacing`, `minItemSpacing` |  |  |
| `LineGeometry` | Media | `endPoint`, `startPoint` |  |  |
| `LineSegment` | Media | `point` |  |  |
| `ListBox` | Controls | `selectionMode`, `singleSelectionFollowsFocus` | `selectedIndex`, `selectedItem`, `selectedValue` | yes |
| `ListBoxItem` | Controls |  |  | yes |
| `ListPickerFlyout` | Controls | `displayMemberPath`, `itemsSource`, `itemTemplate`, `selectedIndex`, `selectedItem`, `selectedValue`, `selectedValuePath`, `selectionMode` | `open` |  |
| `ListView` | Controls |  | `selectedIndex`, `selectedItem`, `selectedValue`, `selectedKey`, `selectedKeys` | yes |
| `ListViewHeaderItem` | Controls |  |  | yes |
| `ListViewItem` | Controls |  |  | yes |
| `ListViewItemPresenter` | Controls.Primitives | `checkBoxBorderBrush`, `checkBoxBrush`, `checkBoxCornerRadius`, `checkBoxDisabledBorderBrush`, `checkBoxDisabledBrush`, `checkBoxPointerOverBorderBrush`, `checkBoxPointerOverBrush`, `checkBoxPressedBorderBrush`, +51 more |  | yes |
| `MapControl` | Controls | `center`, `interactiveControlsVisible`, `layers`, `mapServiceToken`, `zoomLevel` |  |  |
| `MapElementsLayer` | Controls | `mapElements` |  |  |
| `MapIcon` | Controls | `location` |  |  |
| `Matrix3DProjection` | Media | `projectionMatrix` |  | yes |
| `MatrixTransform` | Media | `matrix` |  |  |
| `MediaPlayerElement` | Controls | `areTransportControlsEnabled`, `autoPlay`, `isFullWindow`, `posterSource`, `source`, `stretch`, `transportControls` |  |  |
| `MediaPlayerPresenter` | Controls | `isFullWindow`, `mediaPlayer`, `stretch` |  |  |
| `MediaTransportControls` | Controls | `fastPlayFallbackBehaviour`, `isCompact`, `isFastForwardButtonVisible`, `isFastForwardEnabled`, `isFastRewindButtonVisible`, `isFastRewindEnabled`, `isNextTrackButtonVisible`, `isPlaybackRateButtonVisible`, +17 more |  |  |
| `MenuBar` | Controls |  |  |  |
| `MenuBarItem` | Controls | `title` |  |  |
| `MenuBarItemFlyout` | Controls |  | `open` | yes |
| `MenuFlyout` | Controls | `menuFlyoutPresenterStyle` | `open` | yes |
| `MenuFlyoutItem` | Controls | `command`, `commandParameter`, `icon`, `keyboardAcceleratorTextOverride`, `text` |  | yes |
| `MenuFlyoutPresenter` | Controls | `isDefaultShadowEnabled`, `systemBackdrop` |  | yes |
| `MenuFlyoutSeparator` | Controls |  |  |  |
| `MenuFlyoutSubItem` | Controls | `icon`, `text` |  | yes |
| `MicaBackdrop` | Media | `kind` |  |  |
| `MonochromaticOverlayPresenter` | Controls.Primitives | `replacementColor`, `sourceElement` |  | yes |
| `NavigationThemeTransition` | Media.Animation | `defaultNavigationTransitionInfo` |  | yes |
| `NavigationView` | Controls | `alwaysShowHeader`, `autoSuggestBox`, `compactModeThresholdWidth`, `compactPaneLength`, `contentOverlay`, `expandedModeThresholdWidth`, `footerMenuItemsSource`, `header`, +24 more | `isPaneOpen`, `selectedItem`, `displayMode` | yes |
| `NavigationViewItem` | Controls | `hasUnrealizedChildren`, `icon`, `infoBadge`, `isChildSelected`, `isExpanded`, `menuItemsSource`, `selectsOnInvoked` |  | yes |
| `NavigationViewItemHeader` | Controls |  |  | yes |
| `NavigationViewItemPresenter` | Controls.Primitives | `icon`, `infoBadge` |  | yes |
| `NavigationViewItemSeparator` | Controls |  |  | yes |
| `NonVirtualizingLayout` | Controls |  |  |  |
| `NumberBox` | Controls | `acceptsExpression`, `description`, `header`, `headerTemplate`, `isWrapEnabled`, `largeChange`, `maximum`, `minimum`, +11 more | `value` |  |
| `ObjectAnimationUsingKeyFrames` | Media.Animation | `enableDependentAnimation` |  | yes |
| `Page` | Controls | `bottomAppBar`, `navigationCacheMode`, `topAppBar` |  | yes |
| `PaneThemeTransition` | Media.Animation | `edge` |  |  |
| `Paragraph` | Documents | `textIndent` |  | yes |
| `ParallaxView` | Controls | `child`, `horizontalShift`, `horizontalSourceEndOffset`, `horizontalSourceOffsetKind`, `horizontalSourceStartOffset`, `isHorizontalShiftClamped`, `isVerticalShiftClamped`, `maxHorizontalShiftRatio`, +6 more |  |  |
| `PasswordBox` | Controls | `description`, `header`, `headerTemplate`, `inputScope`, `isPasswordRevealButtonEnabled`, `maxLength`, `password`, `passwordChar`, +6 more | `password` |  |
| `Path` | Shapes | `data` |  |  |
| `PathFigure` | Media | `isClosed`, `isFilled`, `segments`, `startPoint` |  | yes |
| `PathGeometry` | Media | `figures`, `fillRule` |  | yes |
| `PathIcon` | Controls | `data` |  |  |
| `PathIconSource` | Controls | `data` |  |  |
| `PersonPicture` | Controls | `badgeGlyph`, `badgeImageSource`, `badgeNumber`, `badgeText`, `contact`, `displayName`, `initials`, `isGroup`, +2 more |  |  |
| `PerspectiveTransform3D` | Media.Media3D | `depth`, `offsetX`, `offsetY` |  |  |
| `PickerFlyout` | Controls | `confirmationButtonsVisible`, `content` | `open` | yes |
| `PipsPager` | Controls | `maxVisiblePips`, `nextButtonStyle`, `nextButtonVisibility`, `normalPipStyle`, `numberOfPages`, `orientation`, `previousButtonStyle`, `previousButtonVisibility`, +3 more |  |  |
| `Pivot` | Controls | `headerFocusVisualPlacement`, `headerTemplate`, `isHeaderItemsCarouselEnabled`, `isLocked`, `leftHeader`, `leftHeaderTemplate`, `rightHeader`, `rightHeaderTemplate`, +4 more | `selectedIndex`, `selectedItem` | yes |
| `PivotHeaderPanel` | Controls.Primitives |  |  | yes |
| `PivotItem` | Controls | `header` |  | yes |
| `PivotPanel` | Controls.Primitives |  |  | yes |
| `PlaneProjection` | Media | `centerOfRotationX`, `centerOfRotationY`, `centerOfRotationZ`, `globalOffsetX`, `globalOffsetY`, `globalOffsetZ`, `localOffsetX`, `localOffsetY`, +4 more |  |  |
| `PointAnimation` | Media.Animation | `by`, `easingFunction`, `enableDependentAnimation`, `from`, `to` |  |  |
| `PointAnimationUsingKeyFrames` | Media.Animation | `enableDependentAnimation` |  | yes |
| `PointerDownThemeAnimation` | Media.Animation | `targetName` |  |  |
| `PointerUpThemeAnimation` | Media.Animation | `targetName` |  |  |
| `PolyBezierSegment` | Media | `points` |  | yes |
| `Polygon` | Shapes | `fillRule`, `points` |  |  |
| `Polyline` | Shapes | `fillRule`, `points` |  |  |
| `PolyLineSegment` | Media | `points` |  | yes |
| `PolyQuadraticBezierSegment` | Media | `points` |  | yes |
| `PopInThemeAnimation` | Media.Animation | `fromHorizontalOffset`, `fromVerticalOffset`, `targetName` |  |  |
| `PopOutThemeAnimation` | Media.Animation | `targetName` |  |  |
| `Popup` | Controls.Primitives | `child`, `desiredPlacement`, `horizontalOffset`, `isLightDismissEnabled`, `isOpen`, `lightDismissOverlayMode`, `placementTarget`, `shouldConstrainToRootBounds`, +2 more | `isOpen`, `actualPlacement` | yes |
| `PopupThemeTransition` | Media.Animation | `fromHorizontalOffset`, `fromVerticalOffset` |  |  |
| `PowerEase` | Media.Animation | `power` |  |  |
| `ProgressBar` | Controls | `isIndeterminate`, `showError`, `showPaused` | `value` |  |
| `ProgressRing` | Controls | `isActive`, `isIndeterminate`, `maximum`, `minimum`, `value` |  |  |
| `QuadraticBezierSegment` | Media | `point1`, `point2` |  |  |
| `QuadraticEase` | Media.Animation |  |  |  |
| `QuarticEase` | Media.Animation |  |  |  |
| `QuinticEase` | Media.Animation |  |  |  |
| `RadialGradientBrush` | Media | `center`, `gradientOrigin`, `interpolationSpace`, `mappingMode`, `radiusX`, `radiusY`, `spreadMethod` |  |  |
| `RadioButton` | Controls | `groupName` | `isChecked` | yes |
| `RadioButtons` | Controls | `header`, `headerTemplate`, `itemsSource`, `itemTemplate`, `maxColumns`, `selectedIndex`, `selectedItem` | `selectedIndex`, `selectedItem` |  |
| `RadioMenuFlyoutItem` | Controls | `groupName`, `isChecked` |  | yes |
| `RatingControl` | Controls | `caption`, `initialSetValue`, `isClearEnabled`, `isReadOnly`, `itemInfo`, `maxRating`, `placeholderValue`, `value` | `value` |  |
| `RatingItemFontInfo` | Controls | `disabledGlyph`, `glyph`, `placeholderGlyph`, `pointerOverGlyph`, `pointerOverPlaceholderGlyph`, `unsetGlyph` |  |  |
| `RatingItemImageInfo` | Controls | `disabledImage`, `image`, `placeholderImage`, `pointerOverImage`, `pointerOverPlaceholderImage`, `unsetImage` |  |  |
| `RatingItemInfo` | Controls |  |  |  |
| `Rectangle` | Shapes | `radiusX`, `radiusY` |  |  |
| `RectangleGeometry` | Media | `rect` |  |  |
| `RefreshContainer` | Controls | `pullDirection`, `visualizer` |  | yes |
| `RefreshVisualizer` | Controls | `content`, `orientation` |  |  |
| `RelativePanel` | Controls | `backgroundSizing`, `borderBrush`, `borderThickness`, `cornerRadius`, `padding` |  | yes |
| `RenderTargetBitmap` | Media.Imaging |  |  |  |
| `ReorderThemeTransition` | Media.Animation |  |  |  |
| `RepeatButton` | Controls.Primitives | `delay`, `interval` |  | yes |
| `RepositionThemeAnimation` | Media.Animation | `fromHorizontalOffset`, `fromVerticalOffset`, `targetName` |  |  |
| `RepositionThemeTransition` | Media.Animation | `isStaggeringEnabled` |  |  |
| `RevealListViewItemPresenter` | Controls |  |  | yes |
| `RichEditBox` | Controls | `acceptsReturn`, `characterCasing`, `clipboardCopyFormat`, `description`, `desiredCandidateWindowAlignment`, `disabledFormattingAccelerators`, `header`, `headerTemplate`, +15 more |  |  |
| `RichTextBlock` | Controls | `characterSpacing`, `fontFamily`, `fontSize`, `fontStretch`, `fontStyle`, `fontWeight`, `foreground`, `horizontalTextAlignment`, +18 more | `isTextTrimmed` | yes |
| `RichTextBlockOverflow` | Controls | `maxLines`, `overflowContentTarget`, `padding` | `isTextTrimmed` |  |
| `RotateTransform` | Media | `angle`, `centerX`, `centerY` |  |  |
| `Run` | Documents | `flowDirection`, `text` |  | yes |
| `ScaleTransform` | Media | `centerX`, `centerY`, `scaleX`, `scaleY` |  |  |
| `ScrollBar` | Controls.Primitives | `indicatorMode`, `orientation`, `viewportSize` | `value` |  |
| `ScrollContentPresenter` | Controls | `canContentRenderOutsideBounds`, `canHorizontallyScroll`, `canVerticallyScroll`, `scrollOwner`, `sizesContentToTemplatedParent` |  | yes |
| `ScrollPresenter` | Controls.Primitives | `background`, `content`, `contentOrientation`, `horizontalAnchorRatio`, `horizontalScrollChainMode`, `horizontalScrollController`, `horizontalScrollMode`, `horizontalScrollRailMode`, +10 more | `state` |  |
| `ScrollView` | Controls | `content`, `contentOrientation`, `horizontalAnchorRatio`, `horizontalScrollBarVisibility`, `horizontalScrollChainMode`, `horizontalScrollMode`, `horizontalScrollRailMode`, `ignoredInputKinds`, +9 more | `extentHeight`, `extentWidth`, `horizontalOffset`, `state`, `verticalOffset`, `zoomFactor` |  |
| `ScrollViewer` | Controls | `bringIntoViewOnFocusChange`, `canContentRenderOutsideBounds`, `horizontalAnchorRatio`, `horizontalScrollBarVisibility`, `horizontalScrollMode`, `horizontalSnapPointsAlignment`, `horizontalSnapPointsType`, `isDeferredScrollingEnabled`, +20 more | `horizontalOffset`, `verticalOffset`, `zoomFactor` | yes |
| `SelectorBar` | Controls | `selectedItem` | `selectedItem` |  |
| `SelectorBarItem` | Controls | `icon`, `text` |  |  |
| `SemanticZoom` | Controls | `canChangeViews`, `isZoomedInViewActive`, `isZoomOutButtonEnabled`, `zoomedInView`, `zoomedOutView` |  | yes |
| `SineEase` | Media.Animation |  |  |  |
| `SkewTransform` | Media | `angleX`, `angleY`, `centerX`, `centerY` |  |  |
| `SlideNavigationTransitionInfo` | Media.Animation | `effect` |  |  |
| `Slider` | Controls | `header`, `headerTemplate`, `intermediateValue`, `isDirectionReversed`, `isThumbToolTipEnabled`, `orientation`, `snapsTo`, `stepFrequency`, +3 more | `value` |  |
| `SoftwareBitmapSource` | Media.Imaging |  |  |  |
| `SolidColorBrush` | Media | `color` |  | yes |
| `Span` | Documents | `inlines` |  | yes |
| `SplineColorKeyFrame` | Media.Animation | `keySpline` |  |  |
| `SplineDoubleKeyFrame` | Media.Animation | `keySpline` |  |  |
| `SplinePointKeyFrame` | Media.Animation | `keySpline` |  |  |
| `SplitButton` | Controls | `command`, `commandParameter`, `flyout` |  | yes |
| `SplitCloseThemeAnimation` | Media.Animation | `closedLength`, `closedTarget`, `closedTargetName`, `contentTarget`, `contentTargetName`, `contentTranslationDirection`, `contentTranslationOffset`, `offsetFromCenter`, +3 more |  |  |
| `SplitMenuFlyoutItem` | Controls | `subMenuItemStyle`, `subMenuPresenterStyle` |  | yes |
| `SplitOpenThemeAnimation` | Media.Animation | `closedLength`, `closedTarget`, `closedTargetName`, `contentTarget`, `contentTargetName`, `contentTranslationDirection`, `contentTranslationOffset`, `offsetFromCenter`, +3 more |  |  |
| `SplitView` | Controls | `compactPaneLength`, `content`, `displayMode`, `isPaneOpen`, `lightDismissOverlayMode`, `openPaneLength`, `pane`, `paneBackground`, +1 more | `isPaneOpen` | yes |
| `StackLayout` | Controls | `orientation`, `spacing` |  |  |
| `StackPanel` | Controls | `areScrollSnapPointsRegular`, `backgroundSizing`, `borderBrush`, `borderThickness`, `cornerRadius`, `orientation`, `padding`, `spacing` |  | yes |
| `StandardUICommand` | Input | `kind` |  |  |
| `Storyboard` | Media.Animation |  |  | yes |
| `SuppressNavigationTransitionInfo` | Media.Animation |  |  |  |
| `SvgImageSource` | Media.Imaging | `rasterizePixelHeight`, `rasterizePixelWidth`, `uriSource` |  |  |
| `SwapChainPanel` | Controls |  |  | yes |
| `SwipeBackThemeAnimation` | Media.Animation | `fromHorizontalOffset`, `fromVerticalOffset`, `targetName` |  |  |
| `SwipeControl` | Controls | `bottomItems`, `leftItems`, `rightItems`, `topItems` |  | yes |
| `SwipeHintThemeAnimation` | Media.Animation | `targetName`, `toHorizontalOffset`, `toVerticalOffset` |  |  |
| `SwipeItem` | Controls | `background`, `behaviorOnInvoked`, `command`, `commandParameter`, `foreground`, `iconSource`, `text` |  |  |
| `SwipeItems` | Controls | `mode` |  | yes |
| `SymbolIcon` | Controls | `symbol` |  |  |
| `SymbolIconSource` | Controls | `symbol` |  |  |
| `SystemBackdropElement` | Controls | `cornerRadius`, `systemBackdrop` |  |  |
| `TabView` | Controls | `addTabButtonCommand`, `addTabButtonCommandParameter`, `allowDropTabs`, `canDragTabs`, `canReorderTabs`, `canTearOutTabs`, `closeButtonOverlayMode`, `isAddTabButtonVisible`, +10 more | `selectedIndex`, `selectedItem` |  |
| `TabViewItem` | Controls | `header`, `headerTemplate`, `iconSource`, `isClosable` |  | yes |
| `TabViewListView` | Controls.Primitives |  | `selectedIndex`, `selectedItem`, `selectedValue` | yes |
| `TeachingTip` | Controls | `actionButtonCommand`, `actionButtonCommandParameter`, `actionButtonContent`, `actionButtonStyle`, `closeButtonCommand`, `closeButtonCommandParameter`, `closeButtonContent`, `closeButtonStyle`, +12 more | `isOpen` | yes |
| `TextBlock` | Controls | `characterSpacing`, `fontFamily`, `fontSize`, `fontStretch`, `fontStyle`, `fontWeight`, `foreground`, `horizontalTextAlignment`, +17 more | `isTextTrimmed` | yes |
| `TextBox` | Controls | `acceptsReturn`, `characterCasing`, `description`, `desiredCandidateWindowAlignment`, `header`, `headerTemplate`, `horizontalTextAlignment`, `inputScope`, +18 more | `selectionLength`, `selectionStart`, `text` |  |
| `TextCommandBarFlyout` | Controls |  | `open` |  |
| `TextHighlighter` | Documents | `background`, `foreground` |  |  |
| `ThemeShadow` | Media |  |  |  |
| `Thumb` | Controls.Primitives |  |  |  |
| `TickBar` | Controls.Primitives | `fill` |  |  |
| `TimePicker` | Controls | `clockIdentifier`, `header`, `headerTemplate`, `lightDismissOverlayMode`, `minuteIncrement`, `selectedTime`, `time` | `selectedTime`, `time` | yes |
| `TimePickerFlyout` | Controls | `clockIdentifier`, `minuteIncrement`, `time` | `open` |  |
| `TitleBar` | Controls | `autoRefreshDragRegions`, `content`, `iconSource`, `isBackButtonEnabled`, `isBackButtonVisible`, `isPaneToggleButtonVisible`, `leftHeader`, `rightHeader`, +2 more |  |  |
| `ToggleButton` | Controls.Primitives | `isChecked`, `isThreeState` | `isChecked` | yes |
| `ToggleMenuFlyoutItem` | Controls | `isChecked` |  | yes |
| `ToggleSplitButton` | Controls | `isChecked` | `isChecked` | yes |
| `ToggleSwitch` | Controls | `header`, `headerTemplate`, `isOn`, `offContent`, `offContentTemplate`, `onContent`, `onContentTemplate` | `isOn` | yes |
| `ToolTip` | Controls | `horizontalOffset`, `isOpen`, `placement`, `placementRect`, `placementTarget`, `verticalOffset` | `isOpen` | yes |
| `TransformGroup` | Media |  |  | yes |
| `TranslateTransform` | Media | `x`, `y` |  |  |
| `TreeView` | Controls | `canDragItems`, `canReorderItems`, `itemContainerStyle`, `itemContainerStyleSelector`, `itemsSource`, `itemTemplate`, `itemTemplateSelector`, `selectedItem`, +2 more | `selectedKey`, `selectedKeys`, `expandedKeys` |  |
| `TreeViewItem` | Controls | `collapsedGlyph`, `expandedGlyph`, `glyphBrush`, `glyphOpacity`, `glyphSize`, `hasUnrealizedChildren`, `isExpanded`, `itemsSource` |  | yes |
| `TreeViewList` | Controls |  | `selectedIndex`, `selectedItem`, `selectedValue` | yes |
| `TreeViewNode` | Controls | `content`, `hasUnrealizedChildren`, `isExpanded` |  |  |
| `TwoPaneView` | Controls | `minTallModeHeight`, `minWideModeWidth`, `pane1`, `pane1Length`, `pane2`, `pane2Length`, `panePriority`, `tallModeConfiguration`, +1 more | `mode` |  |
| `Underline` | Documents |  |  | yes |
| `UniformGridLayout` | Controls | `itemsJustification`, `itemsStretch`, `maximumRowsOrColumns`, `minColumnSpacing`, `minItemHeight`, `minItemWidth`, `minRowSpacing`, `orientation` |  |  |
| `UserControl` | Controls | `content` |  | yes |
| `VariableSizedWrapGrid` | Controls | `horizontalChildrenAlignment`, `itemHeight`, `itemWidth`, `maximumRowsOrColumns`, `orientation`, `verticalChildrenAlignment` |  | yes |
| `Viewbox` | Controls | `child`, `stretch`, `stretchDirection` |  | yes |
| `VirtualizingLayout` | Controls |  |  |  |
| `VirtualizingStackPanel` | Controls | `areScrollSnapPointsRegular`, `orientation` |  | yes |
| `WebView2` | Controls | `canGoBack`, `canGoForward`, `defaultBackgroundColor`, `source` |  |  |
| `WrapGrid` | Controls | `horizontalChildrenAlignment`, `itemHeight`, `itemWidth`, `maximumRowsOrColumns`, `orientation`, `verticalChildrenAlignment` |  | yes |
| `XamlUICommand` | Input | `accessKey`, `command`, `description`, `iconSource`, `label` |  |  |

<!-- controls:end -->

How a value is written:

- An enum prop takes the member's name (`horizontalAlignment="Center"`) or its
  number.
- A thickness takes `8`, `[8, 4]`, `[left, top, right, bottom]` or a CSS-order
  string; a corner radius a number or an array; a grid length `"Auto"`, `"*"`,
  `"2*"` or pixels.
- A brush takes a color string or a WinUI theme resource name, so light and dark
  stay WinUI's.
- A time (`duration`, `beginTime`, a key frame's `keyTime`) takes milliseconds
  (`300`) or text with its unit (`"0.3s"`, `"2m"`) or as a clock
  (`"0:00:05"`); a `duration` also takes `"auto"` and `"forever"`, and a
  `repeatBehavior` a count (`3`, `"3x"`), a length of time or `"forever"`.
- A date (`DatePicker.date`, `CalendarDatePicker.minDate`) takes a `Date`,
  milliseconds since 1970 or an ISO string, and `null` where WinUI allows none.
  A bound date or time reads back as a `Date` or as milliseconds.
- A `fontWeight` takes a name (`"bold"`, `"semiBold"`) or a number from 1 to
  999.
- A point, size, rect, matrix or vector takes an array (`[x, y]`,
  `[width, height]`, `[x, y, width, height]`, `[x, y, z]`) or WinUI's own
  object. A list of points (`points` of a `Polygon`) takes points or text
  (`"0,0 10,0 10,10"`); a list of numbers (`strokeDashArray`) takes numbers or
  text (`"4 2"`).
- A geometry prop (`Path.data`, `PathIcon.data`) takes path data as XAML writes
  it (`"M0,0 L10,10"`).
- An image source takes a URI (one ending in `.svg` is drawn as an SVG) or the
  bytes of an image file (`Uint8Array`, `ArrayBuffer`). A `MediaPlayerElement`'s
  `source` takes a URI.
- An `itemsSource` takes an array, which becomes the collection WinUI reads; an
  `inputScope` takes a name (`"Url"`) or a list of names.
- A property that takes any object (`header`, `content`) takes a string, which is
  boxed for it, or a control.
- Attached properties are plain props: `gridRow`, `gridColumn`, `gridRowSpan`,
  `gridColumnSpan`, `canvasLeft`, `canvasTop`, `canvasZIndex`,
  `automationName`, `automationHelpText`, `toolTip`. Any other:
  `attached={[Owner, "Property", value]}`.
- A `ref` to the native control: `{@attach control(native => ...)}` from
  `winui-svelte` hands your code the WinUI object (typed from your bindings);
  `withControl(StackPanel, panel => ...)` checks its class first.

A property that holds a control or a value object is a snippet prop, so markup
fills it the way XAML does. A brush, geometry, transform, transition,
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
(`EntranceThemeTransition`, `RepositionThemeTransition`...). WinUI leaves
these collections null; the renderer makes the `TransitionCollection` when the
snippet has a transition in it.

```svelte
<StackPanel>
  {#snippet childrenTransitions()}
    <EntranceThemeTransition />
    <RepositionThemeTransition />
  {/snippet}
</StackPanel>
```

One written directly among an element's children (a `Storyboard`) is made but
placed nowhere; reach it with `{@attach control(storyboard => storyboard.begin())}`.

Items come in two forms. `ListView`, `GridView`, `ItemsRepeater`, `ItemsView`,
`BreadcrumbBar` and `TreeView` take `items`, `key` and an `item` snippet, and
keep a row only for each item the control has realized; a `TreeView` also takes
`children` (the items under an item) and `bind:expandedKeys`, and a `ListView`
or `GridView` can show its items in groups (`groupBy`, `groupHeader`). A
control whose items are controls takes them as Svelte's own blocks: `{#each}`
in the children of `ComboBox`, `FlipView` and `ListBox`, or in the snippet of
`NavigationView` (`menuItems`), `TabView` (`tabItems`) and `RadioButtons`
(`items`). [API.md](API.md) has the details.

Pages are Svelte components: `Navigator` shows one in a content control and
keeps the back and forward history (`Frame` needs a page type XAML
registered, which a Node host cannot give it). A page's props are the params
it was navigated to with, and its `NavigationCacheMode` says whether it stays
mounted, with its state, while the user is elsewhere:

```svelte
<script lang="ts">
  import { NavigationCacheMode } from "winui-svelte/components";

  let navigator = $state<NavigatorHandle>();
</script>

<Navigator bind:handle={navigator} onReady={ready => ready.navigate({ page: HomePage })}>
  {#snippet transition()}
    <DrillInNavigationTransitionInfo />
  {/snippet}
</Navigator>

<Button onClick={() => navigator?.navigate({
  page: { component: SettingsPage, cacheMode: NavigationCacheMode.REQUIRED },
  params: { section: "display" }
})}>Settings</Button>
```

`handle.goBack()`, `goForward()`, `canGoBack`, `canGoForward` and `current`
complete it; [API.md](API.md) has the details, and `examples/navigation` ties
it to a `NavigationView`.

`WebView2` is a component like the rest. Its native libraries ship with the
package and `initWindowsAppSdk` makes them findable; the browser starts in an
ordinary desktop session, not in a sandboxed process. A `data:` URL is blocked
as the top frame, as WebView2 does.

The raw elements the components are made of work too: `<stack-panel spacing={8}>`,
`<text-block>`, `grid.column={1}` for an attached property; they need
`registerControls(...)` with the classes they name (a component registers only
its own class, when it is made, so an app bundles only the bindings it uses).
Components are the supported way; see [API.md](API.md) for the raw forms and
the renderer's functions.

## Styling with CSS

`<style>` blocks are translated at build time into WinUI `Style`s and applied
by class, so a card is `class="card"` and a rule, as on the web. Layout
properties map onto WinUI's panels. A declaration with no WinUI meaning is a
build error with its file and line; nothing is silently ignored.
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
| `grid-template-columns`, `grid-template-rows`, `grid-column`, `grid-row` | `ColumnDefinitions`, `RowDefinitions`, `Grid.Column`... |
| `display: none`, `visibility`, `pointer-events`, `z-index`, `overflow` | `Visibility`, `IsHitTestVisible`, `Canvas.ZIndex`, the scroll bar visibilities |
| `outline`, `outline-offset` | the focus visual: `FocusVisualPrimaryBrush`, `FocusVisualPrimaryThickness`, `FocusVisualMargin` |
| `-winui-elevation`, `backdrop-filter: blur()` | a `ThemeShadow` lifted by its depth; an `AcrylicBrush` Background (the blur radius is ignored) |
| `translate`, `scale`, `rotate`, `transform-origin`, `transition`; `transform` (translate, scale, rotate, skew, matrix) | the UIElement transforms, their pivot (`CenterPoint`, 50% 50% as in CSS) and their implicit transitions |
| `var(--card-background-fill-color-default)` | `{ThemeResource CardBackgroundFillColorDefault}`: WinUI's own resources, so light and dark follow Windows |
| `--name: value` on `:root`, or on a class | an app-wide resource, or one only the elements with that class (and their templates) see: `.danger { --button-background-pointer-over: red }` |
| `.class`, `type`, `:hover`, `:focus`, `:active`, `:root`, `:where()` | class and type matching, the control's events, custom properties |

## Templates, styles and resources

Props typed with a WinUI template take XAML text, so a control is restyled
without leaving Svelte; a `*Style` prop takes the CSS classes whose rules make
its Style; `resources` takes a record of theme keys. WinUI's own objects are
accepted too, and `xamlOf` loads text once for several props.

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

As for any class passed to a component, Svelte does not scope it: write the
rule `:global(.row)`. A root element without `xmlns` gets WinUI's, and the wrong
root for the prop (a `DataTemplate` for `template`) is an error that names both.
A key of `resources` is a custom property's name, as in a stylesheet, or the
resource's own (`ButtonBackground`); a color or length keeps the kind its key
has in WinUI (`ButtonBackground` is a brush, `ButtonPadding` a thickness).
`goToState({ control, name })` enters a state the control's template defines.
[API.md](API.md) has the rest: what each `*Style` prop styles, `xamlOf`, and
what is not covered.

## Transitions

Svelte's compiler refuses `transition:`, `in:`, `out:` and `animate:` on a
custom renderer, so the same transition functions play through attachments
from `winui-svelte/element-animation` (an app that does not import it does not
bundle it):

```svelte
<script lang="ts">
  import { transition } from "winui-svelte/element-animation";
  import { fade } from "svelte/transition";
</script>

{#if isShown}
  <Border {@attach transition({ use: fade, params: { duration: 200 } })}>
    <TextBlock text="Hello" />
  </Border>
{/if}
```

Call `enableElementAnimation()` once before the first component is mounted. The
leaving element stays in its panel until its outro has run, and the animation
moves the control's `Opacity`, `Translation`, `Scale` and `Rotation`. See
[API.md](API.md) for what is and is not animated.

## State

Svelte's own state tools work unchanged (runes, context, `SvelteMap`, stores).
The package adds `winui-svelte/state`: `createHostChannel(transport)`,
`hostState<View>(channel, "view")` and `channel.send(action)`, for state a Tauri
core, an Electron main process or a script owns. A host written in JavaScript
imports `winui-svelte/state/host` (`diff`, the transports, the message types),
which loads in plain Node. [`src/state/README.md`](src/state/README.md) has the
protocol and the tests.

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
| `winui-svelte/element-animation` | `enableElementAnimation`, and the `transition`, `intro` and `outro` attachments |
| `winui-svelte/app` | single-instance handling and app notifications |
| `winui-svelte/connected-animation` | `connectElement` and `startConnected`, WinUI's connected animation between pages |
| `winui-svelte/css/transform`, `/css/focus`, `/css/surface`, `/css/resources` | the opt-in CSS groups: 2D transform, focus visuals, surfaces, theme resources ([`src/css/API.md`](src/css/API.md)) |
| `winui-svelte/css`, `/css/vite`, `/css/sheet-module`, `/css/gradients` | the CSS runtime, its Vite plugin, the sheet module compiler and the gradient parser a sheet with a gradient imports ([`src/css/API.md`](src/css/API.md)) |

The published package ships `dist/`: the TypeScript compiled with its
declarations, and the Svelte files as source (with `types` and `svelte`
conditions on `exports`), which your Vite compiles with the custom renderer.

### Source maps

Every compiled file ships with its source map, and the TypeScript they point at
is in the package (`node_modules/winui-svelte/src`), so your IDE opens the
implementation instead of the declaration: Go to Definition on a
`.d.ts` lands in the `.ts` (declaration maps), and the debugger and your
bundler's production source maps step through the original code. In a Node
process that runs the compiled files, start Node with `--enable-source-maps` so
stack traces name the TypeScript lines. The dev server maps the components it
compiles for you; a component compiled through `compileSvelte` (tests,
`winui-svelte/compile`) ends with an inline map of its own.

## Limitations

Stated plainly, so nobody finds them by surprise:

- **Windows only**, and only Windows 10 1809 and newer. The Windows App SDK
  runtime must be installed; the package does not install it.
- **No base or thin acrylic backdrop.** They need a `SystemBackdrop` subclass
  overriding `OnTargetConnected` (`ISystemBackdropOverrides`), which the
  generated bindings do not expose; `acrylic`, `mica`, `micaAlt` and `none`
  are offered.
- **Needs an unreleased Svelte.** The custom-renderer API is a pull request;
  until it ships, the package works with the pkg.pr.new build named above.
- **`bind:` works on components, not on raw elements.** `<ToggleSwitch bind:isOn>`
  is supported; `<toggle-switch bind:is-on>` is not. Use the component, or
  `{@attach control(...)}` and subscribe to the control's event yourself.
- **A property whose name starts with "on"** (`ToggleSwitch.OnContent`) is a
  prop on components, but on a raw element Svelte takes the attribute for an
  event: write it as `On-content="On"` or `on-content={() => "On"}`.
- **No `:hover` or `:active` miracles on templated controls.** A pseudo-class
  applies a Style when the control reports the event, but WinUI's own template
  states (a Button's pointer-over and pressed brushes) take over from a Style's
  setters while they are active, and a control that handles an event itself (a
  Button handles `PointerPressed`) never reports it, so `:active` does nothing
  there. Override the control's theme resources instead.
- **`transition:`, `in:`, `out:` and `animate:` do not compile.** Svelte's
  custom-renderer build refuses them. Use the `transition`, `intro` and `outro`
  attachments (see "Transitions"); there is no `animate:flip`.
- **Two controls are not components:** `SwapChainBackgroundPanel` (the UWP
  panel WinUI 3 keeps for compatibility, which refuses most element properties;
  `SwapChainPanel` replaces it) and `PivotHeaderItem` (WinUI makes it only
  inside a `Pivot`).
- **`WebView2` needs an ordinary desktop session.** A process a sandbox or a
  service started cannot launch the browser (error 0x8007139F), and a `data:`
  URL cannot be the top frame.
- **CSS is WinUI's subset.** No `position`, `float`, `flex-grow`, `box-shadow`
  (use `-winui-elevation`), `filter`, `animation`, descendant, child or sibling
  selectors, nesting or `@keyframes`: each is a build error that says what to
  use instead. Gradients are `linear-gradient()` and `radial-gradient()` only (no
  repeating or conic ones, no stop in `px`), and replace `background-color`.
  `@media (prefers-color-scheme)` and `@media (forced-colors: active)` can
  declare custom properties only (a Style cannot depend on the scheme).
- **Some CSS is opt-in, and approximate.** `transform` is a 2D RenderTransform
  that no implicit transition animates; `backdrop-filter: blur()` is an acrylic
  that ignores the radius; `-winui-elevation` is a `ThemeShadow`, which needs
  Windows 11 (or receivers a Style cannot set); `outline` is the control's focus
  visual. A custom property on a class applies when the class is on the element
  as it is created: WinUI reads a theme resource again only on a theme change.
- **A hot update to a component that is not self-contained** (a changed `.ts`
  module no component accepts) cannot be applied in place; the dev server says
  so and the window must be restarted. A hot update that cannot compile is
  reported and the window keeps its code.
- **A component's new root control after a hot update** replaces the old one in
  a panel's children, a border's child or a content control's content. A host
  that holds the root somewhere else must listen with `mounted.onRootChange`
  (`createWindow` does).
- **Electron is untested** here (the protocol is shared with Tauri's, which is).

## Development

In this repository (a pnpm workspace; run these in `packages/winui-svelte`):

| | |
| --- | --- |
| `pnpm test` | the unit tests, the generator's tests, and the mount test: every component made and linked in a real WinUI window that opens off screen and never takes focus |
| `pnpm lint` | every check: oxlint, ESLint (Google TypeScript style), `tsc`, `svelte-check`, the editor check, fallow, the check that the generated files are current and the tarball check; `pnpm lint:summary` counts the violations per rule and folder |
| `pnpm gen:components` | regenerates the components, their metadata, the class list the bindings are generated for and the tables and quick start in this README from WinUI's metadata (`pnpm restore` first) |
| `pnpm bindings` | the WinUI bindings (winapp's run, then the WebView2 step); [CONTRIBUTING.md](CONTRIBUTING.md) says when |
| `pnpm build` | `dist/`: what is published (`pnpm pack` shows the tarball) |
| `pwsh examples/hello/run.ps1` | the hello example in a background window, checked through UI Automation (`-Edit` also checks hot reload) |

[DESIGN.md](DESIGN.md) is the architecture and [API.md](API.md) the core API.

## License

[MIT](LICENSE).
