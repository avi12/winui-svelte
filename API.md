# winui-svelte: the core's public API

What `src/renderer`, `src/vite` and `src/window` export
Names are fixed once
this file lands; the other parts code against them
Everything is TypeScript
source: `package.json` `exports` point at `.ts` files, so an app in the
monorepo needs no build step (the repository is a pnpm workspace, see
`pnpm-workspace.yaml`)

## Entry points

| Specifier | File | What |
|---|---|---|
| `winui-svelte` | `src/index.ts` | `control`, `withControl`, `elementRef`, `elementSize`, `elementTheme`, `focusElement`, `glideHeight`, `mountControl`, `registerControls`, `setClassHandler`, `dispatch` / `flush` / `onFlush`, the value helpers |
| `winui-svelte/components` | `src/components/generated/index.ts` | every WinUI 3 control as a component (`StackPanel`, `ToggleSwitch`, ...) and its props type (`ToggleSwitchComponentProps`); `xamlOf`, `goToState`, `installXaml`, `resourceDictionaryOf`; importing it registers the generated bindings with the renderer |
| `winui-svelte/state` | `src/state/index.ts` | `createHostChannel()` (its `messaging` is the typed link), `hostState()`, `StateProtocol`, the transports (stdio, MessagePort, in-memory), `diff` / `applyOps` (see `src/state/README.md`) |
| `winui-svelte/host` | `src/renderer/host/host.ts` | `renderer`, the renderer WinUI controls are built through (`mountControl` makes it the active one), and the mount-target plumbing below; not for app code |
| `winui-svelte/scroll-timeline` | `src/web-apis/scroll-timeline.ts` | `installScrollTimeline()`: `ScrollTimeline`, `ViewTimeline` and `element.animate(keyframes, { timeline })` over Composition (the CSS side is `winui-svelte/css/scroll-timeline`, which a sheet that uses `animation-timeline` imports) |
| `winui-svelte/view-transitions` | `src/web-apis/view-transitions.ts` | `installViewTransitions()`: `document.startViewTransition` and `ViewTransition` over WinUI's connected animations (the CSS side is `winui-svelte/css/view-transition`, which a sheet or style attribute that sets `view-transition-name` imports) |
| `winui-svelte/dialogs` | `src/web-apis/dialogs.ts` | `installDialogs()`, `showDialog()`, `useDialogWindow()`, `DialogResult`, `DialogButton`: `alert`, `confirm` and `prompt` over `ContentDialog`, as promises (opt-in; see Dialogs) |
| `winui-svelte/element-animation` | `src/renderer/host/element-animation.ts` | `enableElementAnimation()`: what Svelte's `transition:`, `in:`, `out:`, `animate:` and `svelte/motion` ask of an element, on WinUI controls (the Vite plugin calls it from a component that uses them; otherwise not bundled) |
| `winui-svelte/attached-owners` | `src/components/attached-owners.ts` | `preloadAttachedOwners(names)`: loads the modules attached properties (`canvasLeft`, `gridRow`) are written through (the Vite plugin calls it from a component whose markup or script names one, so the property is set with the control; a prop named nowhere, built from a computed key, needs `await preloadAttachedOwners(["Canvas"])` first, or its control throws) |
| `winui-svelte/settings` | `src/settings/index.ts` | `SettingsCard`, `SettingsExpander`: Fluent settings cards after the Community Toolkit's (opt-in) |
| `winui-svelte/implicit-layout-animation` | `src/renderer/host/implicit-layout-animation.ts` | `implicitLayoutAnimation({ duration, easing })`, `LayoutEasing`: children slide to their new places when the layout moves them (opt-in) |
| `winui-svelte/connected-animation` | `src/renderer/host/connected-animation.ts` | `connectElement({ key, element })`, `startConnected({ key, element })`: WinUI's connected animation between two pages (opt-in) |
| `winui-svelte/composition` | `src/composition/index.ts` | `animateOnCompositor`, `compositorAnimation`, `visualReference`, `createPropertySet`, the typed expression builder and `scalarSpring` / `vector2Spring` / `vector3Spring`: expression and spring animations on the compositor (opt-in, see "Composition animations") |
| `winui-svelte/keyed-list` | `src/renderer/list/keyed-list.ts` | `syncKeyed()`: sync a native collection to wanted keys, touching only what changed |
| `winui-svelte/state` | `src/state/index.ts` | `createHostChannel()`, `hostState()`, the transports (see `src/state/README.md`) |
| `winui-svelte/messaging` | `src/messaging/index.ts` | `defineMessaging(transport)`: typed `sendMessage` / `onMessage` over a ProtocolMap, as @webext-core/messaging; the state channel is built on it |
| `winui-svelte/messaging/web-view2` | `src/messaging/web-view2/index.ts` | `webView2Transport({ control })` and the typed `CoreWebView2` helpers (opt-in, see "WebView2 bridge") |
| `winui-svelte/messaging/page` | `src/messaging/page.ts` | `createPageTransport()`: the web page's end of the link, no WinUI import, safe for a browser bundle |
| `winui-svelte/vite` | `src/vite/index.ts` | `winuiSvelte()` Vite plugin, `startModuleServer()`, `buildApp()` (the production bundle), compile-error formatting |
| `winui-svelte/dev` | `src/dev/index.ts` | `startDev()`, the dev loop in one call: Windows App SDK, dev server and the window's thread |
| `winui-svelte/runner` | `src/vite/runner.ts` | `createWindowModuleRunner()`, the window thread's side of the module server |
| `winui-svelte/compile` | `src/vite/compile.ts` | `compileSvelte()` for bundlers (esbuild) and tests, `WINUI_COMPILE_OPTIONS`, `withElementAnimation()` |
| `winui-svelte/testing` | `src/vite/loader.ts` | `svelteHooks()`: Node module hooks that run `.svelte` files, with Svelte's runtime read through the package's edits (pure tests) |
| `winui-svelte/bootstrap` | `src/window/bootstrap.ts` | `initWindowsAppSdk()`; imports nothing of WinRT, safe on the host's main thread |
| `winui-svelte/thread` | `src/window/thread.ts` | `runOnUiThread()`; imports only dynwinrt, so the apartment comes first |
| `winui-svelte/window` | `src/window/index.ts` | `runWindow()`, `exitApplication()`, `createWindow()`, `startTimer()`, `systemSettings()`, the picker options (see App services) |
| `winui-svelte/app` | `src/app/index.ts` | `ensureSingleInstance()`, `notify()`, `activateInstance()`, `activateOrLaunch()`, `launchApp()`, `startTray()`, `relaunch()`, `restartAfterCrash()` (opt-in; see App lifecycle) |
| `winui-svelte/app/shell` | `src/app/shell/index.ts` | `trash()`, `openWith()`, `createShortcut()`, `readShortcut()`, `registerAppPath()`, `ShellFailure` (opt-in; see Shell verbs) |
| `winui-svelte/app/activation` | `src/app/activation/index.ts` | `installProtocolHandlers()`, `registerFileTypes()`, `launchAtLogin()`, `startActivation()`, `ActivationKind` (opt-in; see Activation) |
| `winui-svelte/app/jump-list` | `src/app/jump-list/index.ts` | `setJumpListTasks()`, `clearJumpList()` (opt-in; see Jump list tasks) |
| `winui-svelte/data-transfer` | `src/data-transfer/index.ts` | `enableDragEvents()`, `dropzone`, `draggable`, `filePicker`, `pickFiles`, `pickSaveFile`, `clipboard`, `launchUri` / `launchFile` / `openFolder` / `revealInExplorer`, `share`, `NativeFile`, `DataTransfer`, `DragEvent` (opt-in; see Data transfer) |
| `winui-svelte/incremental` | `src/incremental/index.ts` | `createIncrementalSource()`, `IncrementalSource`, `IncrementalStatus`, `IncrementalState` (opt-in; see Incremental loading) |
| `winui-svelte/downloads` | `src/downloads/index.ts` | `Downloads` (`chrome.downloads`), `fetchToFile()`, `markOfTheWeb()`, `DownloadError` (opt-in; see Downloads) |
| `winui-svelte/chrome/runtime` | `src/chrome/runtime/index.ts` | `Runtime` (`chrome.runtime`), `Port`, `InstallReason`, the native messaging codec (opt-in; see Chrome runtime) |
| `winui-svelte/chrome/notifications` | `src/chrome/notifications/index.ts` | `ChromeNotifications` (`chrome.notifications`), `NotificationTemplateType`, `NotificationPermissionLevel` (opt-in; see Chrome notifications) |

| `winui-svelte/chrome/commands` | `src/chrome/commands/index.ts` | `ChromeCommands` (`chrome.commands`), `parseShortcut()` (opt-in; see Chrome commands) |
| `winui-svelte/chrome/action` | `src/chrome/action/index.ts` | `ChromeAction` (`chrome.action`), `createChromeAction()` (opt-in; see Chrome action) |
| `winui-svelte/chrome/i18n` | `src/chrome/i18n/index.ts` | `ChromeI18n` (`chrome.i18n`), `installLanguageDefaults()` (opt-in; see Chrome i18n) |
| `winui-svelte/chrome/install` | `src/chrome/install.ts` | `installChromeApis()`, `ChromeGlobal`, `ChromeAlarms`, `ChromeSystem` (opt-in; see Chrome global) |
| `winui-svelte/input` | `src/input/index.ts` | `enableInputEvents()`, `setPointerCapture` / `releasePointerCapture` / `hasPointerCapture`, `activeElement()`, `moveFocus()`, `trapFocus()`, `PointerType`, `PointerEvent` / `WheelEvent` / `KeyboardEvent` / `FocusEvent` (opt-in; see Input events and focus) |
| `winui-svelte/media` | `src/media/index.ts` | `bitmapImageOf()`, `svgImageSourceOf()`, `decodeDataUri()`, `createMediaPlayer()`, `mediaSourceOfBytes()`, `observePlayback()`, `PlaybackState` (opt-in; see Media) |
| `winui-svelte/win2d` | `src/win2d/index.ts` | `Canvas`, the Win2D controls, the drawing helpers and Win2D classes, `applyEffect` (opt-in; see Win2D) |
| `winui-svelte/enums` | `src/enums.ts` | every closed set a prop or option takes: WinUI's enums, `ThemeBrush`, `ColorKeyword`, `Backdrop`, `WindowTheme`, `TrayBalloonIcon` and the rest (see Closed sets) |
| `winui-svelte/win2d/context-2d` | `src/win2d/context-2d/index.ts` | `Canvas2D`, `createCanvas2D`, `CanvasElement`, `Context2D`, `Path2D` and the rest of the HTML Canvas 2D API over Win2D (opt-in; see Canvas 2D) |
| `winui-svelte/tray` | `src/tray/index.ts` | `TrayIcon` (with its `menu`), `createTrayIcon()`, `placeMenuWindow()`, `hideToTray()`, `restoreFromTray()`, `toggleInTray()`, `removeAllTrayIcons()`, `TrayGesture` (opt-in; see System tray) |
| `winui-svelte/tray/standalone` | `src/tray/standalone/index.ts` | `createStandaloneTray()`, `defineTray()`, its opt-in parts `balloons`, `bounds` and `themedIcon`, `MenuItemKind`, `MenuLevel`, and the `winui-svelte/app` calls that start or signal the app: a tray with no window, no WinUI and no components (opt-in; see Tray with no window) |
| `winui-svelte/notice` | `src/notice/index.ts` | `showNotice()`, `NoticeIcon`, `NoticeButtons`, `NoticeButton`: a message box with no window or app (opt-in; see Notice with no app) |
| `winui-svelte/forms` | `src/forms/index.ts` | `Form`, `FormField`, `textField`, `numberField`, `selectField` and the other field attachments, `formButton`, `FormValues`, `validityOf` (opt-in; see Forms) |
| `winui-svelte/store` | `src/store/index.ts` | `getAppLicense`, `watchLicense`, `checkForUpdates`, `watchPackages`, `getStartupTask`, `getPackageInfo`: the Store and package APIs, answering `hasPackage: false` outside a package (opt-in) |
| `winui-svelte/accessibility`, `/accessibility/audit` | `src/accessibility/index.ts`, `src/accessibility/audit/index.ts` | `announce`, `liveRegion`, `LivePriority`; `auditAccessibility`, `accessibilityRules` (opt-in; see Accessibility) |
| `winui-svelte/devices` | `src/devices/index.ts` | device enumeration, input devices, Bluetooth, printers, power, network, display, audio, gamepads and sensors, each also at `winui-svelte/devices/<area>` (opt-in; see Windows devices) |

The table is the source layout: `exports` point at `.ts` files so the monorepo
needs no build
`pnpm build` compiles them to `dist/` and `publishConfig`
(which pnpm applies when it packs) points `exports` there, with a
`types` and a `svelte` condition on each

### The bindings are the package's

The package imports `#winui/*`, which its `package.json` maps to
`dist/bindings`: the WinUI bindings `winapp node generate-bindings` writes,
copied there by `pnpm build` and published whole
They declare
`"sideEffects": false`, and the Vite plugin tells the bundler so, so an app
bundles only the controls it uses
`src/winui.ts` is the package's one import
site; the vite server loads it, and the bindings, through Node (they are
CommonJS)
The Windows App SDK bootstrapper ships in `dist/bin/<arch>` (with
WebView2's native libraries), which `initWindowsAppSdk()` finds without
arguments
`pnpm bindings` makes the bindings: winapp's run, then WebView2's
(see below)

## Renderer (`winui-svelte`)

```ts
// {@attach control<ToggleSwitch>(toggle => { ...; return () => cleanup })}
// Hands the element's native control to the handler once it is made. The
// handler may return a cleanup; Svelte runs it when the element goes or the
// attachment re-runs. Effects created inside the handler ($effect) belong to
// the attachment, so each re-runs on its own when what it reads changes, and
// they end with it (unmount and hot swaps included). Nothing is called for a
// <host> that holds no control.
function control<Control extends object>(
  handler: (control: Control) => void | (() => void)
): NodeAttachment;

// {@attach withControl(StackPanel, panel => ...)}: the same, checked with
// instanceof (the control is skipped when it is another class).
function withControl<Control>(
  type: abstract new (...values: never[]) => Control,
  use: (control: Control) => void
): NodeAttachment;

// {@attach placedControl(placed => ...)}: the same, and where the element is
// written. A flyout is no element, so WinUI never places it and the tree is
// the only place that says what it belongs to. `parent()` is read when
// called: the control of the nearest element above this one (through
// <property> elements), or null when it is placed in the window itself.
function placedControl<Control extends object>(
  handler: (placed: PlacedControl<Control>) => void | (() => void)
): NodeAttachment;

interface PlacedControl<Control extends object> {
  readonly control: Control;
  parent(): object | null;
}

type NodeAttachment = (node: unknown) => void | (() => void);

// One element's control, held for another element to point at: what an id is
// to aria-labelledby. The visible label keeps its text as children, and the
// control it names reads it from there:
//   const label = elementRef<UIElement>();
//   <TextBlock {@attach label.attach}>Start with Windows</TextBlock>
//   <ToggleSwitch automationLabeledBy={label.current} />
// `current` is reactive: undefined until the element is made and after it goes.
interface ElementRef<Control extends object> {
  readonly current: Control | undefined;
  readonly attach: NodeAttachment;
}
function elementRef<Control extends object>(): ElementRef<Control>;

interface Mounted<Props> {
  readonly root: FrameworkElement;       // the component's first control
  set(changes: Partial<Props>): void;    // changes props, flush() at once
  // Told the new root when the root control changes (a hot update, a root in
  // {#if}). A page that holds the root in a panel's children, a border's child
  // or a content control's content has it swapped in; one that holds it
  // anywhere else (a window's content) places it itself, here.
  onRootChange(listener: (root: FrameworkElement) => void): void;
  unmount(): void;                       // Svelte's unmount (cleanups run), then releases the controls it made
}
function mountControl<Props extends object>(options: {
  component: Component<Props>;
  props: Props;
  intro?: boolean; // play the global in: / transition: directives on this first render; Svelte's default is true
}): Mounted<Props>;

// The classes (and enums) a tag, an enum-valued attribute or an attached
// property may name, by WinUI name: `registerControls(winui)` where `winui` is
// the app's one import site of the bindings (every export becomes a class a
// tag can name). Later calls add to earlier ones.
function registerControls(controls: Record<string, unknown>): void;

// What class="..." does on an element, until the CSS runtime takes it over:
// the app decides (for example, it looks the name up in its XAML styles). With no
// handler, class is ignored.
type ClassHandler = (control: UIElement, value: string) => void;
function setClassHandler(handler: ClassHandler | null): void;

// Value helpers the app needs as well (WinRT values the way bindings take them).
function boxed(value: string | number | boolean): unknown;
// The inverse of boxed, for what an event reports as an object (Tag,
// InvokedItem, SelectedValue): the string, number, boolean or bigint inside a
// box; null for null; any other object as it is.
function unboxed(
  value: unknown
): string | number | boolean | bigint | object | null;
function thickness(left: number, top: number, right: number, bottom: number): Thickness;
function starLength(value?: number): GridLength;
function autoLength(): GridLength;
function pixelLength(value: number): GridLength;
```

A removed subtree ends its event subscriptions and lets go of its controls
(`<host element={control}>` controls live on and can be placed again at once)

Raw kebab elements: tag = WinUI class, kebab attribute = camelCase property,
`grid.column={1}` = attached property, `columns` / `rows` on a grid,
`<host element={control} />` places a control made elsewhere,
`ontoggled={handler}` = the event `Toggled`

A component's event prop is `(sender, args) => void`
The sender is the control that raised the event, as its class
(`sender.isOn` on a `ToggleSwitch`); WinUI itself passes a bare object
The arguments of an event whose delegate is a named one (`RoutedEventHandler`,
`PointerEventHandler`, `KeyEventHandler`) are also a bare object, typed
`EventArguments<RoutedEventArgs>`: `projectAs(args, RoutedEventArgs)` reads
them as the class the type names (the import of the class is the app's, so an
app that never reads the arguments carries none of it)
An event of a `TypedEventHandler` gets both as their classes
An exception a handler throws is written to stderr with its stack and handed
to `runWindow`'s `onerror`; the application goes on

`<property name="childrenTransitions" collection="transition-collection">`
fills a property WinUI leaves null with a collection: when the property holds
none and the element has a control in it, the renderer makes the class the
`collection` tag names (registered through `registerControls`, as the
transition components do) and sets it, then fills it as any collection
The
generated components write this for `transitions`, `childrenTransitions`,
`childTransitions`, `contentTransitions`, `itemContainerTransitions`,
`headerTransitions` and `footerTransitions` (`createdCollections` in
`scripts/codegen/tables.ts`), which are snippet props in place of the
properties, and each transition component registers `TransitionCollection`

A property whose name starts with "on" (ToggleSwitch.OnContent) on a raw
element: Svelte takes any attribute starting with lower-case "on" for an event
(`on-content="x"` is a compile error; `on-content={value}` hands the host a
wrapper that cannot be read)
Two forms work: `On-content="On"` (a capital O is
not Svelte's event rule), and `on-content={() => "On"}` (an inline function is
handed over as it is and read once, when the element is made)
A property that
changes is set through `{@attach control(...)}`, as components do

## Wrapping chips

CSS `flex-wrap: wrap` has no WinUI panel to become: the element's tag decides
the panel, the build does not swap it, and `flex-wrap` stays a build error whose
message names the two ways below (WinUI 3 has no `WrapPanel`; the Community
Toolkit's is a separate package)
Measured in a 300 wide window (`test/chip-tray.test.ts`, the
`examples/chip-tray` example)

| Way | Wraps | Chip widths | Use it for |
|---|---|---|---|
| `RichTextBlock`, a `Paragraph`, each chip in an `InlineUIContainer` | yes, like words in a sentence | each chip keeps its own | link chips, tags, any tray whose items differ in width |
| `VariableSizedWrapGrid` | yes, at its width or `maximumRowsOrColumns` | one cell for all (the first chip sets it, or `itemWidth` and `itemHeight`) | equal tiles |
| `ItemsRepeater` with `UniformGridLayout`, `GridView` | yes | one cell for all | the same, with virtualization and selection |

The first row is the answer to `flex-wrap`:

```svelte
<script lang="ts">
  import { Border, HyperlinkButton, InlineUIContainer, Paragraph, RichTextBlock } from "winui-svelte/components";
</script>

<RichTextBlock>
  <Paragraph>
    {#each links as link (link.href)}
      <InlineUIContainer>
        <Border class="chip">
          <HyperlinkButton navigateUri={link.href}>{link.label}</HyperlinkButton>
        </Border>
      </InlineUIContainer>
    {/each}
  </Paragraph>
</RichTextBlock>

<style>
  .chip {
    margin: 0 6px 6px 0;
  }
</style>
```

- The gap between chips is each chip's margin: a `RichTextBlock` has no `gap`
- Chips sit on the text baseline; `RichTextBlock` has `textAlignment`, which
  centres or right-aligns the lines
- The tray is text: a `RichTextBlock` is read-only and takes `isTextSelectionEnabled`
- Not covered: a CSS rule cannot turn `display: flex; flex-wrap: wrap` into this
  (a flex container is a `<stack-panel>` or `<grid>` and the build never changes
  a tag), and `ItemsRepeater` has no layout that flows items of different widths
  (`UniformGridLayout` is uniform, `LinedFlowLayout` needs one line height and
  aspect ratios from its items)

## Transitions (`winui-svelte/element-animation`, `winui-svelte/element-effects`)

Svelte's `transition:`, `in:`, `out:` and `animate:` run unchanged: Svelte's
runtime asks its elements for `animate()`, `getComputedStyle`,
`getBoundingClientRect`, `inert` and `requestAnimationFrame`, and
`enableElementAnimation` answers for WinUI's controls
The Vite plugin (and the
Node loader) appends the call to every component that has a directive or
imports `svelte/transition`, `svelte/animate` or `svelte/motion`, so you call
it yourself only to give another clock (a test) or when you do not use the
plugin
It is idempotent, and an app that never uses a transition never bundles
the module
A component that imports `blur` or `draw` from `svelte/transition` also gets
`enableElementEffects()` of `winui-svelte/element-effects` (Win2D and
Composition, which no other transition loads), so `blur` blurs and `draw`
measures a `path`
It hands the blur to the animations through `provideElementBlur(setBlur)` of
`winui-svelte/element-animation`, which another drawing of the blur may call
the same way

A directive goes on a raw element (`<border transition:fade>`), as Svelte does
not allow one on a component (`component_invalid_directive`); to move a
component in and out, wrap it in a raw element that carries the directive
(`<border transition:fade><Button /></border>`), or use the control's own
`transitions` property (WinUI's entrance and exit transitions)

`|global` and `|local` mean what they do in Svelte: a transition is local by
default and plays only when the block it sits in comes or goes itself, a
global one plays whenever any ancestor block does
`mountControl({ component, props, intro: false })` keeps the global `in:` and
`transition:` directives from playing on the first render (Svelte's `mount`
plays them by default, and so does `intro: true`)

```ts
function enableElementAnimation(options?: {
  clock?: AnimationClock; // default: the UI thread's dispatcher timer, ~16 ms
  onFrame?: () => void; // default: flush()
  warn?: (message: string) => void; // default: console.warn
  createDashes?: (lengths: number[]) => object; // default: a DoubleCollection
  setBlur?: (input: { control: object; radius: number | null }) => void; // default: the blur of winui-svelte/element-effects, if it is in use
}): () => void; // turns it off again
```

What it does:

- An animation it returns has a `PlayState` (`idle`, `running`, `paused`,
  `finished`), and can be paused, resumed, reversed, finished, cancelled and
  seeked, with the web's `delay`, `endDelay`, `iterations`, `direction`,
  `easing` and `fill`; `winui-svelte/web-apis/animations` wraps it in the web's
  `Animation`
- A keyframe is read with the CSS value parsers into the control's `Opacity`,
  `Translation`, `Scale`, `Rotation` (`opacity`, `translate`, `scale`,
  `rotate`, `transform` with those functions, `transform-origin` as fractions
  or keywords), `Width`, `Height`, `Margin`, `Padding` and `BorderThickness`
  (by side) and a shape's `StrokeDashArray` and `StrokeDashOffset`
  (`stroke-dasharray`, `stroke-dashoffset`)
  Its values are applied about every
  16 ms, and the control's own come back when the animation ends
- `fade`, `fly`, `scale`, `slide` (the height, margin, padding and border
  collapse, the layout clips what overflows), `crossfade` (pairs by key; the
  incoming element scales from its corner) and `draw` work
  `draw` measures a
  `line`, `polyline`, `polygon`, `ellipse` or `rectangle` itself, and a `path` with
  `winui-svelte/element-effects` (below): a `<path>` takes a `Geometry` (a
  `PathGeometry`, or a line, rectangle or ellipse geometry, or a group of them)
  rather than path data, which Win2D measures as a `CanvasGeometry`, closing
  included
- `animate:flip` reads each element's place from `TransformToVisual` after a
  layout pass
  A leaving element in a keyed `{#each}` inside a `StackPanel` (a panel with an
  `Orientation`) gives its room back to the panel at once: its trailing margin
  along the panel's axis is made as negative as its size, so it stays drawn
  where it is while its siblings flip into place, and its own margin is back
  if it returns
  In a panel with no axis (a `Grid`, a `Canvas`) the element stays in the
  layout while it leaves, and its siblings move when it is gone
- A leaving element stays in its parent, out of reach (`IsHitTestVisible`
  false, Svelte's `inert`), until its outro has run, then Svelte removes it
- `Tween`, `Spring`, the older `tweened` and `spring` stores and a transition's
  `tick` step on `requestAnimationFrame`, which is the same clock
  (`examples/stores` and `test/stores.test.ts` run all four against a
  `ProgressBar` and an element's opacity)
  `prefersReducedMotion` matches nothing
- `filter: blur(<length>)` (what Svelte's `blur` writes) is read as the radius
  of a blur, which `setBlur` draws: with `winui-svelte/element-effects` it is a
  real Gaussian blur of the element's Composition visual, animated by its
  radius and let go of when it reaches 0; without it `blur` only fades, and a
  warning says so
- A property WinUI cannot animate (any other `filter`) is named once through
  `warn` and left out
- `onintrostart`, `onintroend`, `onoutrostart` and `onoutroend` are Svelte's
  events, not WinUI's: the element holds the handler (it is never given to the
  control) and Svelte raises them as the transition begins and ends
- `getComputedStyle` is defined as a global for WinUI's elements; any other
  argument goes to the one that was there, if any

### Gliding a height (`glideHeight`)

WinUI cannot animate `Height="Auto"`, so a card whose content grows or shrinks
jumps; the web's answer is a `ResizeObserver` plus `element.animate({ height })`,
and `glideHeight` is that pair as one attachment:

```svelte
<script lang="ts">
  import { glideHeight } from "winui-svelte";
  import { enableElementAnimation } from "winui-svelte/element-animation";

  enableElementAnimation();
</script>

<border class="card" {@attach glideHeight({ duration: 300, easing: "ease-out" })}>
  <text-block textWrapping="Wrap">{text}</text-block>
</border>
```

- It listens to the element's `SizeChanged`; on a change it runs
  `element.animate([{ height: from }, { height: to }])`, which sets `Height`
  explicitly for the glide and gives `Auto` back when it ends (`element.animate`
  animates `height` and `width` like it does `Opacity` and `Translation`)
- Needs `enableElementAnimation()` once (a `transition:` directive in the
  app turns it on too); without it `glideHeight` throws and says so
- Can: grow and shrink, any easing and duration, a change made during a glide
  (picked up when it ends), a hot update or removal (the glide is cancelled);
  reduced motion makes it instant
- Cannot: glide the first layout, an element with a fixed `height` (it never
  changes by itself), or the content inside; the layout is already at the new
  height when the glide starts, so the frame before the first step can show it,
  and content that would overflow a shrinking card is clipped only if the card
  clips it (`clip-to-bounds`, a `ScrollViewer`)
- Measured in a window (`test/card-glide.test.ts`, the `examples/card-glide`
  example): 250 ms into a 600 ms glide the height lies between the two sizes,
  both growing and shrinking, and the card ends on its content's height with no
  fixed `Height` left

### Sliding siblings (`implicitLayoutAnimation`)

When an expander opens, the controls below it jump; on the web a FLIP
animation slides them, and in WinUI the Composition layer does it with an
implicit animation on each child's `Offset`

```svelte
<script lang="ts">
  import { implicitLayoutAnimation, LayoutEasing } from "winui-svelte/implicit-layout-animation";
</script>

<stack-panel {@attach implicitLayoutAnimation({ duration: 260, easing: LayoutEasing.EASE_OUT })}>
  <expander header="Advanced">...</expander>
  <button>Save</button>
</stack-panel>
```

- It is an attachment for a panel; every child that the panel has laid out gets
  a `Vector3KeyFrameAnimation` on `Offset` that ends at `this.FinalValue`, so
  the composition layer starts it by itself whenever layout changes the offset
  (no per-frame work in JavaScript, no `enableElementAnimation()`)
- `duration` is in milliseconds (default 260); `easing` is one of
  `LayoutEasing` (`ease`, `ease-in`, `ease-out`, `ease-in-out`, `linear`,
  `emphasized`; default `ease-out`)
- A child that is added slides from nowhere: the panel picks it up on its next
  layout, after it was placed, so only the ones that were already there move
- Reduced motion: with Windows' animation effects off the attachment does
  nothing, and it starts when they are turned on
- It replaces a child's own `implicitAnimations`, and it
  is not a CSS property: the CSS part has no hook that reaches a Visual's
  implicit animation collection cheaply, so the attachment is the one way
- Measured in a window (`test/layout-animation.test.ts`, the
  `examples/layout-animation` example): 800 ms into a 5 s slide the marker
  that a growing spacer pushes down is drawn between its two places, and ends
  in the second
- `style:translate="0px 60px"` on a component (`<Border style:translate=...>`)
  works: the same test reads the pixels and finds the control drawn 60 px lower
  at once, with its layout slot left unchanged

## Settings cards (`winui-svelte/settings`)

The Windows Community Toolkit's `SettingsCard` and `SettingsExpander` are
managed code with no projectable metadata, so these are built from WinUI's own
controls (`Border`, `Button`, `Grid`, `FontIcon`, `TextBlock`, `Expander`) and
the card theme resources (`CardBackgroundFillColorDefaultBrush` and
`CardStrokeColorDefaultBrush`), so light, dark and high contrast follow Windows

```svelte
<script lang="ts">
  import { ToggleSwitch } from "winui-svelte/components";
  import { SettingsCard, SettingsExpander } from "winui-svelte/settings";

  let isExpanded = $state(false);
</script>

<SettingsCard description="Start with Windows" header="Run at startup" headerIcon="PowerButton">
  <ToggleSwitch />
</SettingsCard>
<SettingsCard header="Open the logs" isClickEnabled onclick={openLogs} />
<SettingsExpander header="Appearance" bind:isExpanded>
  {#snippet items()}
    <SettingsCard header="Theme">...</SettingsCard>
  {/snippet}
</SettingsExpander>
```

| Prop | Meaning |
|---|---|
| `header`, `description` | the name and the line under it |
| `headerIcon` | a Fluent glyph name or code, or a snippet that draws an icon |
| children | the control on the right (the toolkit's `Content`) |
| `isClickEnabled`, `onclick` | the card is a `Button`: focus, Enter and Space, a pressed state |
| `actionIcon`, `action` | the glyph at the end of a clickable card (default `ChevronRight`), or a snippet that replaces it |
| `isEnabled`, `automationId` | as on any control |
| `SettingsExpander`: `isExpanded`, `items` | `bind:isExpanded`; the items are `SettingsCard`s, which draw flat inside |

- Accessibility: a clickable card carries its header as the UI Automation name
  and its description as the help text, and the expander is named after its
  header; a card that is not clickable is a plain container whose texts are read
- Measured in a window (`test/settings-cards.test.ts`, the
  `examples/settings-cards` example): a card is at least 68 px high, the
  clickable card is named after its header, the items of a closed expander take
  no room and show once it is open; the gallery has a `Settings cards` page
- Not there: the toolkit's `SettingsCard.ContentAlignment`, `IsActionIconVisible`
  and its automatic wrapping into two rows on a narrow window; the content sits
  on the right at its own size

## Connected animation (`winui-svelte/connected-animation`)

`connectElement({ key, element })` remembers an element as the start of a
connected animation, just before navigating; `startConnected({ key, element })`
on the next page plays it from there to the new element and returns whether one
was prepared under the key (WinUI forgets it after a few seconds, and plays it
once)
Both take the current view's service unless a `host` is given

```ts
import { connectElement, startConnected } from "winui-svelte/connected-animation";

connectElement({ key: "photo", element: thumbnail });
startConnected({ key: "photo", element: hero });
```

## Composition animations (`winui-svelte/composition`)

Expression and spring animations that the compositor runs on its own thread,
typed end to end: an expression is built from typed parts and prints its own
text, so a member a visual does not have, or an animation of the wrong kind
for its property, fails `tsc`
The scroll-linked animations of `animation-timeline` are built with the same
expression builder

- `visualReference(element)`: an element's visual for expressions to read;
  its members are `VISUAL_MEMBERS` (`offset`, `scale`, `translation`,
  `centerPoint` are three-component, `size` and `anchorPoint` two-component,
  `opacity` and `rotationAngleInDegrees` scalars), and a vector member gives
  its components (`offset.y`): a member is a `Vector2Member` or
  `Vector3Member`, the expression of its kind with `x`, `y` (and `z`)
- An expression is a `ScalarExpression`, `Vector2Expression` or
  `Vector3Expression`, each with `plus`, `minus` (its own kind, or a plain
  number, `{ x, y }` or `{ x, y, z }`), `times`, `dividedBy` (a scalar),
  `negated()` and `lerp({ to, amount })`; a scalar also has
  `clamped({ min, max })`
  `scalar(1)`, `vector2({ x, y })` and `vector3({ x, y, z })` make literals,
  `reference({ name, members, source })` names any Composition object with the
  members it declares (`ExpressionKind` gives each one's kind)
- `rawExpression({ kind, text, references })` is the escape hatch: expression
  text as it is, with the kind it gives and the objects it names
- `scalarSpring`, `vector2Spring`, `vector3Spring` take `SpringOptions`:
  `finalValue`, and optionally `initialValue`, `initialVelocity`,
  `dampingRatio` (below 1 overshoots), `period` and `delay` in milliseconds
- `animateOnCompositor({ element, property, animation })` starts an expression
  or a spring on a property of the element's visual (`offset`, `offset.x`,
  `opacity`...; `translation` is enabled on the element when it is used) and
  returns a `RunningAnimation`: `stop()`, and `finished`, which settles when a
  spring comes to rest or the animation is stopped
  `compositorAnimation({ property, animation })` is the same as an attachment,
  stopped when the element goes or the attachment runs again
- `createPropertySet({ element, values })` makes a `CompositionPropertySet`
  whose members are the keys of `values`, each a number, `{ x, y }` or
  `{ x, y, z }`: `reference` reads them in expressions, `insert(changes)`
  writes new values from the UI thread, `animate({ property, animation })`
  drives one on the compositor, `close()` releases it

```svelte
<script lang="ts">
  import type { Border as BorderControl } from "#winui/microsoft/ui/xaml/controls/Border";
  import { elementRef } from "winui-svelte";
  import { Border } from "winui-svelte/components";
  import { compositorAnimation, vector3Spring, visualReference } from "winui-svelte/composition";

  const leader = elementRef<BorderControl>();
</script>

<Border
  {@attach compositorAnimation({
    property: "offset",
    animation: vector3Spring({ finalValue: { x: 200, y: 0, z: 0 }, dampingRatio: 0.4, period: 80 })
  })}
  {@attach leader.attach}
/>
{#if leader.current}
  <Border
    {@attach compositorAnimation({
      property: "offset",
      animation: visualReference(leader.current).offset.plus({ x: 0, y: 120, z: 0 })
    })}
  />
{/if}
```

- Values read on the UI thread (`Visual.Offset`) are the last ones set there,
  not the animated ones; read an animated value back from what is drawn
- Not there yet: `InteractionTracker` (input-driven inertia, which needs a
  `VisualInteractionSource` redirected from a pointer press and bindings not
  generated today) and springs as a CSS easing (`transition-timing-function`
  has no spring function on the web to map)

## Scheduling (`winui-svelte`)

```ts
// Runs `work` on the UI thread's DispatcherQueue (call it on the UI thread),
// then flush(). How state that arrives off the dispatcher reaches the UI.
function dispatch(work: () => void): void;

// Svelte's flushSync(), then every onFlush listener. Call it after changing
// state from code that is not an event handler (Node's microtasks, where
// Svelte schedules its own flush, do not run while WinUI holds the thread).
function flush(): void;

// For other parts (the CSS runtime) that must act after Svelte has applied a
// batch. Returns what removes the listener.
function onFlush(listener: () => void): () => void;
```

## Dev loop (`winui-svelte/dev`)

```ts
interface DevOptions {
  root: string;                 // the folder of the app's sources
  component: string;            // the root component, a path under root ("/App.svelte")
  props?: Record<string, Json>;
  host?: "stdio" | Transport; // the link to the Tauri core, Electron main process or script that started this process
  window?: object;              // title, size, backdrop and the rest of createWindow's chrome
  configFile?: string;
  isNative?: (file: string) => boolean;
}

// Opens the component in a window and keeps it live: a saved .svelte or .ts
// file updates the open window without a restart. Resolves to the exit code
// once the window has closed and the server stopped.
function startDev(options: DevOptions): Promise<number>;
```

With `host`, a Tauri core (a sidecar on `"stdio"`) or an Electron main process
(a `utilityProcess` and a transport of its own) owns the state: the component
gets a `channel` prop (`hostState`, `channel.send`) and the window closes when
the link ends, so the dev loop runs under the real framework and a saved file
still updates the open window

`startDev` joins `initWindowsAppSdk`, `startModuleServer` and a worker whose
`runOnUiThread` creates the module runner and the window; a host that needs its
own (a second window, a message link) uses those pieces directly

## Vite (`winui-svelte/vite`)

```ts
// The one line in an app's vite.config.ts: compiles .svelte files and
// .svelte.ts runes modules with Svelte's own compiler (client generation, css
// "external": the CSS part takes the <style> blocks over; Svelte's hot module
// replacement in serve), reads Svelte's runtime with the package's event edits,
// and sets the "browser" and "svelte" resolve conditions and the window module
// environment (named "winui"). No other Svelte plugin is needed or wanted.
function winuiSvelte(): Plugin[];

// The pure parts, for tests.
function winuiPluginOptions(): { compile: CompileOptions };
function windowConfig(): UserConfig;

// Hot reload inside the window process: a Vite dev server with no HTTP
// server, talking to the module runner over a MessagePort pair.
function startModuleServer(options: {
  root: string;
  port: MessagePort;                       // the runner's counterpart
  configFile?: string;                     // the app's vite.config; without one, winuiSvelte() defaults serve
  isNative?: (file: string) => boolean;    // an app's own native modules (the package's bindings are built in)
}): Promise<ViteDevServer>;

// The production build: one Vite SSR build per entry, each written as a single
// self-contained file (`<name>.js`) that runs on plain Node. Components and
// the package's .svelte.js rune modules are compiled for the client, Svelte
// resolves to its browser build, and the files the app reads at run time (the
// native module, the bootstrapper, the resource catalogue) are written beside
// the bundles, so the folder runs without node_modules.
function buildApp(options: {
  root: string;                            // the app's folder
  entries: Record<string, string>;         // output name to source file: { main, window }
  outDirectory: string;                    // emptied first
  isMinified?: boolean;                    // default false; off for apps that draw with Win2D
  config?: InlineConfig;                   // Vite settings merged over these (an alias, a plugin)
}): Promise<string[]>;                     // the files written, relative to outDirectory

// winui-svelte/runner: the window thread's side. Hot updates arrive as messages
// on the port, which the window's loop delivers; one that cannot be applied is
// reported and the window goes on.
function createWindowModuleRunner(port: MessagePort): { runner: ModuleRunner };
```

Svelte is a published release (peer range `5.51.1 - 5.57.3`), compiled with its own
compiler and run on its own client runtime
The package owns the rest: the
tree's nodes are shaped like DOM nodes (`src/renderer/tree/dom.ts`), and
`installDom()` (`document.ts`, called by `mountControl`) defines the `document`,
`Node`, `Element`, `Text`, `Comment` and `DocumentFragment` the runtime reads
A component's static markup is parsed once into inert nodes and cloned into
the tree
A few spots of the runtime are read with edits (`runtime-patch.ts`,
applied by the plugin and by `svelteHooks()`): a handler gets all of WinUI's
arguments (sender and args), delegated events listen on their own control, the
root listener is off, and an element is made without a namespace
An anchor is matched by its tokens, whatever the whitespace between them
An edit whose anchor is missing throws, naming the file and the Svelte
release: it means a release outside the peer range

Compile errors: a `.svelte` file that does not compile is printed on the host
process's stderr as `file:line:column: message [code]` and its code frame (at
start, the process then ends with that as its reason; on a hot update, the
window keeps running with the code it has, and the next good save applies)
`describeError()` / `compileDiagnostic()` / `formatDiagnostic()` are exported
for tools; `compileSvelte()` throws an `Error` with that message

## Window (`winui-svelte/bootstrap`, `/thread`, `/window`)

```ts
// bootstrap: finds Microsoft.WindowsAppRuntime.Bootstrap.dll in `folders` (first
// match wins), sets WINAPPSDK_BOOTSTRAP_DLL_PATH, puts the folder it was found
// in on PATH (WebView2's native libraries are there) and initialises the
// Windows App SDK. Sets WEBVIEW2_USER_DATA_FOLDER to `webViewUserDataFolder`
// unless it is already set. Throws WindowsAppRuntimeMissing when the runtime is
// not installed.
function initWindowsAppSdk(options?: {
  major?: number;
  minor?: number;
  folders?: string[];
  webViewUserDataFolder?: string;
}): void;

// thread (in the worker that owns the UI thread; WinUI's loop never gives its
// thread back): enters the single-threaded apartment first, so everything
// `main` loads may create WinRT objects, awaits main, ends the process.
function runOnUiThread(main: () => Promise<void>): Promise<never>;

// window: starts WinUI on this thread: Application (WinUI's own resources
// installed), then `onStart` on the UI thread. Settles when the app exits.
function runWindow(options: { onStart: () => void; onerror?: UiErrorListener }): Promise<void>;
function exitApplication(): void;

// Errors on the UI thread. An exception app code throws where WinUI calls it
// (an event handler, a prop the control refuses, a dispatcher callback,
// onStart) is caught there, written to stderr as
// `[winui-svelte] event "ontoggled": Error: ...` with its stack, and handed to
// the listeners; the application goes on. runWindow's `onerror` is the
// `window.onerror` of the app; onUiError adds listeners and returns the
// function that removes one; reportUiError sends an error of your own the
// same way.
interface UiErrorReport { readonly error: unknown; readonly origin: string }
type UiErrorListener = (report: UiErrorReport) => void;
function onUiError(listener: UiErrorListener): () => void;
function reportUiError(report: UiErrorReport): void;

// `setInterval` (or `setTimeout` when isRepeating is false) with the stop
// handed back as a function; the same scheduler as the standard timers
// (see Timers and I/O). Returns what stops it.
function startTimer(options: { milliseconds: number; onTick: () => void; isRepeating?: boolean }): () => void;

// A window around a component (mounted: props can change, it can be
// unmounted) or a control. Call it on the UI thread, from onStart or later.
function createWindow<Props extends object>(options: WindowOptions<Props>): AppWindow<Props>;

type WindowOptions<Props> = {
  title?: string;
  size?: { width: number; height: number };   // device pixels
  backdrop?: Backdrop;                        // "acrylic" | "acrylicBase" | "acrylicThin" | "mica" | "micaAlt" | "none" | "transparent"
  extendsIntoTitleBar?: boolean;
  isBackground?: boolean;                     // shown without activating (tests, captures)
} & ({ component: Component<Props>; props: Props } | { control: FrameworkElement });

interface AppWindow<Props> {
  readonly window: Window;
  readonly handle: WindowHandle;              // what chromeWindowSurface and the rest of the window API take
  readonly mounted: Mounted<Props> | null;    // null for a control
  close(): void;
  onClosed(listener: () => void): void;
}
```

Who starts the process is the app's business (Tauri sidecar, Electron utility
process, plain Node): its main thread calls `initWindowsAppSdk`, starts a
worker whose file calls `runOnUiThread(() => ...)`, which loads the app and
calls `runWindow`
A transport (JSON lines on stdio, a MessagePort) is not in
these files: it is `src/state`'s, which uses `dispatch` to put host messages
on the UI thread
`examples/counter` is the working example (its `launch.ts`
is the host, its `window.ts` the UI-thread worker)

## Controls (`winui-svelte/components`)

One row for each component, with a link to the WinUI docs of its class
The table shows the props a class adds (the rest come from the classes it
inherits from); `Bindable` includes the inherited bindables, and `Children`
says the component takes content (its WinUI content property: `Content`,
`Child`, `Children`, `Items`...) as children

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

## Writing values and content (`winui-svelte/components`)

How a value is written:

  (`horizontalAlignment={HorizontalAlignment.Center}`; the value and its type
  share the name) or the member's WinUI name as text, and nothing else, so the
  editor offers exactly the members; a flag enum also
  takes a list of names (`modifiers={["Control", "Shift"]}`)
- Padding, margin, spacing, font size, colours and sizes are CSS, in the
  `<style>` of the component (see [Styling with CSS](https://github.com/avi12/winui-svelte/blob/main/README.md#styling-with-css)); the props of those names
  exist as WinUI has them, and a prop beats a rule
- A thickness takes `8`, `[8, 4]`, `[left, top, right, bottom]` or a CSS-order
  string; a corner radius a number or an array; a grid length `"Auto"`, `"*"`,
  `"2*"` or pixels
- A brush takes a color (`"#0078d4"`, `"transparent"`), one of WinUI's theme
  brushes by name (`"AcrylicBackgroundFillColorDefaultBrush"`, the `ThemeBrush`
  set), so light and dark stay WinUI's, or a brush the app names in
  `AppBrushes` (see Closed sets)
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

Content, transitions, items, pages and raw elements:

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

## Hosts: Tauri, Electron and Node

**Tauri** (what [Edge+](https://github.com/avi12/edge-plus) does)
The Rust
core starts the window as a child process
(a sidecar: your `main.ts`, or the bundle `buildApp` writes, run by a Node
that ships with the app; see [Production build](https://github.com/avi12/winui-svelte/blob/main/README.md#production-build)) with its
stdin and stdout piped, writes request lines
(`{"id":1,"type":"snapshot","data":{"name":"view","value":{...}},"timestamp":...}`)
and later `patch` ones, and reads `action` requests back, answering each with a
response line (`{"id":1,"response":null}` or `{"id":1,"error":"..."}`)
The names are fixed: `snapshot` carries `{name, value}`, the whole value of
one named state; `patch` carries `{name, ops}`; a window reads the state it
names with `hostState({ channel, name })`
A core that already sends the whole state under another request type (a
`view` request, say) renames that one frame to `snapshot` with the state's
name in `data.name`, in the core or in a small adapter between the pipes
Do not call `createStdioTransport()` in the window: the window runs on a
worker (the UI thread), and a worker's `process.stdin` and `process.stdout` are
not the process's pipes
The sidecar's main thread owns the pipes: it calls `reserveStdout()` (so a
stray `console.log` goes to stderr and cannot corrupt the protocol), makes the
stdio transport, and relays every value, unread, to the window over a
`MessageChannel`; the window makes `createMessagePortTransport({ port })` on
its end and builds its channel from that
[`examples/sidecar/main.ts`](https://github.com/avi12/winui-svelte/blob/main/examples/sidecar/main.ts) is the relay, about 30 lines
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
and the window as the [Quick start](https://github.com/avi12/winui-svelte/blob/main/README.md#quick-start)'s `main.ts` does, and keeps its state in plain objects
`examples/counter` is a host in Node that owns `{ count, history }`, sends it
with `diff()`, and answers the window's actions over a `MessagePort`
(`examples/counter/run.ps1` clicks its buttons through UI Automation)

## Value props (`winui-svelte/components`)

A prop whose WinUI type is a value struct or a collection of them takes an
input a person writes, and the component converts it
(`src/components/convert.ts`, parsed by `src/components/values.ts`, which
needs no WinUI)
WinUI's own value is always accepted as well, so a value read
from a control can be written back
Which converter a type gets is the table
`kindOfType` in `scripts/codegen/tables.ts` (`nullableKindOfType` for
`IReference<T>`); the emitter reads the converter, input type and read-back of
each kind from one table in `scripts/codegen/emit.ts`

| WinUI type | Input type | Written as |
|---|---|---|
| `TimeSpan`, `KeyTime` | `TimeSpanInput`, `KeyTimeInput` | `300`, `"0.3s"`, `"0:00:05"` |
| `Duration` | `DurationInput` | the same, `"auto"`, `"forever"` |
| `RepeatBehavior` | `RepeatBehaviorInput` | `3`, `"3x"`, `"2s"`, `"forever"` |
| `FontWeight` | `FontWeightInput` | `"bold"`, `650` |
| `DateTime` | `DateInput` | a `Date`, milliseconds, an ISO string |
| `Point`, `Size`, `Rect`, `Matrix`, `Vector3` | `PointInput`, ... | `[x, y]`, `{ x, y }` |
| `PointCollection` | `PointCollectionInput` | `[[0, 0], [10, 10]]`, `"0,0 10,10"` |
| `DoubleCollection` | `DoubleCollectionInput` | `[4, 2]`, `"4 2"` |
| `InputScope` | `InputScopeInput` | `"Url"`, `["Url", "Search"]` |
| `Geometry` | `GeometryInput` | `"M0,0 L10,10"` |
| `ImageSource` | `ImageSourceInput` | a URI (`.svg` makes an `SvgImageSource`), or the bytes of an image file (`Uint8Array`, `ArrayBuffer`; SVG text makes an `SvgImageSource`) |
| `IMediaPlaybackSource` | `MediaPlaybackSourceInput` | a URI, opened as a `MediaSource` (`MediaPlayerElement.source`) |
| an `itemsSource` | `CollectionInput` | an array, made an `IVector` of boxed items |

Image bytes and media URIs go through streams and `MediaSource`, which a bundle
of one Button does not carry: `runWindow` installs them, and an app that starts
WinUI another way calls `installMedia()`
Bytes are written to an in-memory
stream and the image fills itself when it is ready; a bad image raises the
image's own `ImageFailed` event

The nullable ones (`beginTime`, `selectedDate`, ...) take `null` as well
A
bindable `date` or time reads back as a `Date` or as milliseconds
For an event
argument, `ticksDate(ticks)` and `ticksMilliseconds(ticks)` from
`winui-svelte/components` turn WinUI's ticks (`args.newDate.universalTime`,
`args.newTime.duration`) into the same

## Closed sets (`winui-svelte/enums`)

Wherever a prop or an option takes only a set of values, its type is exactly
that set, so the editor offers the members and refuses anything else, and the
set is exported from `winui-svelte/enums` under one name for the value and the
type, as the repository writes every closed set (an `as const` object and its
union):

```ts
import { Backdrop, HorizontalAlignment, ThemeBrush } from "winui-svelte/enums";
import type { Orientation } from "winui-svelte/enums";

const backdrop: Backdrop = Backdrop.micaAlt;
const vertical: Orientation = 1;
```

| Kind | Takes | Example |
|---|---|---|
| A WinUI enum (`EnumInput`) | the member's value from `winui-svelte/enums` (its WinUI name as text also works) | `closedDisplayMode={AppBarClosedDisplayMode.Minimal}` |
| A flag enum WinUI marks `[Flags]` (`FlagsInput`) | the same, or a list of names it combines | `modifiers={["Control", "Shift"]}` |
| A color (`ColorInput`) | hex text (`HexColor`), a `ColorKeyword`, or WinUI's own value | `"#0078d4"`, `"transparent"` |
| A brush (`BrushInput`) | a color, a `ThemeBrush`, a key of `AppBrushes`, or a `Brush` | `"AcrylicBackgroundFillColorDefaultBrush"` |
| An icon glyph (`GlyphInput`, on `FontIcon` and `FontIconSource`) | a name of Segoe Fluent Icons, the code point of one (only a `FluentGlyph` value, no other number), code points to compose, or the character (`fontFamily` takes a family name such as `"Segoe Fluent Icons"` or a `FontFamily`; `FluentGlyph` from `winui-svelte/components` holds the code point of each icon by name; the types `FluentGlyphName`, `FluentGlyphCode` and `FluentGlyphValue` (a name or a code point) name its parts) | `glyph="Save"`, `glyph={FluentGlyph.Save}`, `glyph={[FluentGlyph.GlobalNavButton, FluentGlyph.Save]}`, `glyph=""` |
| A path geometry (`GeometryInput`, on `PathIcon` and `Path`) | Path Markup Syntax text or a `Geometry` | `data="M0,0 L10,10"` |
| A font family (`FontFamilyInput`) | a family name or a `FontFamily` | `"Segoe UI Variable"` |
| A grid length (`GridLengthInput`) | pixels, or `GridLengthText` as XAML writes it | `"Auto"`, `"2*"`, `"120"` |
| The package's own | `Backdrop`, `WindowTheme`, `TitleBarHeight`, `WindowPresentation`, `PickerLocation`, `NavigationCacheMode`, `NavigationMode`, `MoveDirection`, `XamlKind`, `FocusKind`, `TrayGesture`, `TrayBalloonIcon`, `ConnectedAnimationKind`, `DialogResult`, `DialogButton` | `backdrop={Backdrop.mica}` |

A WinUI enum's members keep WinUI's names and case (`"Minimal"`, not
`"minimal"`), as the metadata and the docs have them; the package's own sets
use lower camel case values (`"micaAlt"`)
WinUI's enums come from the bindings, one module each, generated from the
metadata into `src/components/generated/enums.ts`; `ThemeBrush` is generated
from the brush keys of WinUI's theme (`src/css/winui-resources.g.json`)

The entry only re-exports, so an app bundles the sets it imports and nothing
more, and `import type` costs nothing; `scripts/pack/treeshake.test.ts` proves
it on a bundle

A brush the app defines itself (in `resources`, or the application's
dictionary) is named once, then a brush prop takes it too:

```ts
declare module "winui-svelte/components" {
  interface AppBrushes {
    BrandBrush: true;
  }
}
```

Text read from loose data (a message, a file) is narrowed with
`isColorText(text)` from `winui-svelte/components` before a color prop takes
it
Time spans, durations and repeat behaviors keep text forms (`"0.3s"`,
`"3x"`) a template type cannot close without refusing valid text, so they stay
`string` and are checked when written

## Templates, styles and resources (`winui-svelte/components`)

A prop typed with a WinUI template takes XAML text; a `*Style` prop takes CSS
class names; `resources` takes a record
Each also takes WinUI's own object
(a `ControlTemplate`, a `Style`, a `ResourceDictionary`), so a value read
from a control can be written back
The kind of each prop is read from its type
(`kindOfType` in `scripts/codegen/tables.ts`), and the converter and input
type of each kind come from the table in `scripts/codegen/emit.ts`

| WinUI type | Props | Input type | Written as |
|---|---|---|---|
| `ControlTemplate` | `template` | `ControlTemplateInput` | XAML text starting with `<ControlTemplate` |
| `DataTemplate` | `contentTemplate`, `itemTemplate`, `headerTemplate` (19 controls), ... | `DataTemplateInput` | XAML text starting with `<DataTemplate` |
| `ItemsPanelTemplate` | `itemsPanel` | `ItemsPanelTemplateInput` | XAML text starting with `<ItemsPanelTemplate` |
| `Style` | `itemContainerStyle`, `closeButtonStyle`, `textBoxStyle`, ... | `StyleInput` | CSS class names |
| `ResourceDictionary` | `resources` | `ResourcesInput` | a record of resources |

```svelte
<Button
  template="<ControlTemplate TargetType='Button'><Border Background='Teal'>
    <ContentPresenter/></Border></ControlTemplate>"
  resources={{ "--button-background-pointer-over": "#c42b1c", "--button-padding": 12 }}>
  Save
</Button>

<ListView items={rows} key={row => row.id} itemContainerStyle="row">
  {#snippet item(row)}
    <TextBlock>{row.name}</TextBlock>
  {/snippet}
</ListView>

<ItemsControl itemsSource={names} itemsPanel="<ItemsPanelTemplate>
  <StackPanel Orientation='Horizontal'/></ItemsPanelTemplate>"
  itemTemplate="<DataTemplate><TextBlock Text='{Binding}'/></DataTemplate>" />
```

`ListView`, `GridView`, `ItemsRepeater`, `BreadcrumbBar` and `ItemsView` show
their items by a snippet and own their item template; the other items
controls (`ItemsControl`, `ComboBox`, `TreeView`, ...) take `itemTemplate`

```ts
xamlOf({ kind: XamlKind, xaml }): ControlTemplate | DataTemplate | ...
goToState({ control, name, useTransitions = false }): boolean
installXaml(): void
resourceDictionaryOf(record: ResourceRecordInput): ResourceDictionary
```

- **`xamlOf`** loads XAML text through `XamlReader` as the kind named by
  `XamlKind` (`controlTemplate`, `dataTemplate`, `itemsPanelTemplate`,
  `style`, `resourceDictionary`) and returns the class, to keep and give to
  several props
  The root element must be the kind's (a `RangeError` names the
  kinds, a `TypeError` the root it found), and a root that declares no
  `xmlns` or `xmlns:x` gets WinUI's, so a template is written without them
  `src/components/xaml-source.ts` checks the text and needs no WinUI
- **A prop given XAML text** loads it the same way
  The components reach the
  reader through a seam (`src/components/xaml-seam.ts`), so an app that
  writes no template does not bundle `XamlReader` or the template classes:
  `runWindow` installs it when the application starts, and a host of one's own
  (a test that creates the application itself) calls `installXaml()` once
  Without it a string throws, saying so
- **A `*Style` prop given class names** gets the Style the `<style>` rules
  for those classes make for the element the prop styles
  (`styleOfClasses` in [`src/css/API.md`](src/css/API.md))
  WinUI does not say
  which element that is, so `src/components/style-targets.ts` does: the button
  of `closeButtonStyle`, the `TextBox` of `textBoxStyle`, and for
  `itemContainerStyle` the container of the control (`ListViewItem` for a
  `ListView`, `GridViewItem`, `ComboBoxItem`, `FlipViewItem`,
  `TreeViewItem`; a control not listed takes a `Style` object)
  The
  generator refuses a Style prop that table lacks
  The rule is written in the component's own `<style>`, scoped: the build
  adds the component's scope class to the prop's value (text, an expression
  as `[value, scope]`), and `styleOf` matches `.row.svelte-<hash>`; `:global(.row)`
  works too
  The Style is built when the
  prop is set and states are ignored; a class no rule matches, or one that
  sets what only an element holds (a grid's columns, the focus ring, a custom
  property), throws
  `FrameworkElement.Style` stays skipped: `style` is the CSS
  string of the element
- **A `resources` record** maps resource keys to values
  A key is a custom
  property's name (`"--button-background"`, the form a stylesheet uses) or the
  resource's own (`ButtonBackground`)
  A color or a length keeps the kind its key has in WinUI, by the rule CSS
  custom properties follow (`entriesForKey`, `src/css/translate/variables.ts`): a
  Brush key such as `ButtonBackground` gets a `SolidColorBrush`, a Thickness
  key (`ButtonPadding`) one length on every side, a CornerRadius key a
  `CornerRadius`, any other number a `Double`; a key WinUI does not define
  is a `Color` with a `Brush` of the same name plus `Brush`
  A key is
  spelled as WinUI spells it whatever case it is written in
  Text for a text or
  font family key, a boolean, and a WinRT object (a brush, a style) are put in
  as they are
  A value of another kind than its key's throws with the key and
  its kind
  The record becomes the element's whole `Resources` (as
  `<Button.Resources>` does); the kinds come from `winui-resources.g.json`,
  read the first time a record is given
  The prop does not combine with a class
  whose custom properties are merged into the same element's resources
- **`goToState`** is `VisualStateManager.GoToState`: it enters a state the
  control's template defines (`Pressed`, `PointerOver`) and returns whether
  it did
  The template must be applied (`control.applyTemplate()`, or the
  control shown)

### Visual states

`VisualStateGroup`, `VisualState`, `VisualTransition`, `Setter`,
`AdaptiveTrigger` and `StateTrigger` are components
A group holds states
(its children), a state holds its `setters` and `stateTriggers` (snippets)
and a storyboard (its children or the `storyboard` snippet)
`VisualStateGroups`
puts the groups in the element it sits in: WinUI's
`VisualStateManager.VisualStateGroups` has a getter and no setter, so no
snippet can fill it
It is no element, so the panel lays out its siblings only:

```svelte
<UserControl>
  <Grid>
    <Border {@attach control(native => (box = native))} />
    <VisualStateGroups>
      <VisualStateGroup name="Sizes">
        <VisualState name="Wide">
          {#snippet stateTriggers()}
            <AdaptiveTrigger minWindowWidth={640} />
          {/snippet}
          {#snippet setters()}
            <Setter target={box} path="Opacity" value={0.5} />
          {/snippet}
        </VisualState>
      </VisualStateGroup>
    </VisualStateGroups>
  </Grid>
</UserControl>
```

Three things WinUI forces, each read once, when the control is made (see
`src/components/constructed.ts`): `name` of a state or a group (WinUI names
them only when XAML makes them, so the component makes them through
`XamlReader`), and `target` and `path` of a `Setter` (a visual state refuses a
setter that has no target, so mount it where the element it changes exists,
inside an `{#if}`)
`path` is a property path as XAML writes it (`Opacity`,
`(Grid.Row)`); `value` is boxed like any object prop
The triggers act on a
control's template root, so put the groups in the root of a `UserControl` (or a
`Page`), not under a window's bare content; `goToState` enters a state by name

## Components that show items (`winui-svelte/components`)

A control that shows its items from a data source is generated like the rest,
with `items`, `key` and `item` in place of its children and items source: the
table `itemsHosted` in `scripts/codegen/tables.ts` names them and the host each
uses (`src/components/hand-written/items`)
They are `ListView`, `GridView`,
`ItemsRepeater`, `ItemsView`, `BreadcrumbBar` and `TreeView`
`ListView` and
`GridView` report their containers (and take the list props below); `TreeView`
reports the containers of the list inside it (and takes the tree props below);
the other three keep their items in an `ItemsRepeater`, whose elements the host
fills, and take `items`, `key` and `item` only
Every other property, event and snippet slot
of the control is the generated component's
`Window` is not a control (it is
no UIElement), so it is the one component only in `hand-written/` and
`components/index.ts`

A control whose items are controls takes them as Svelte's own blocks, which are
its item template: `{#each rows as row (row.id)}<ComboBoxItem>{row.name}</ComboBoxItem>{/each}`
keeps, adds, moves and removes items as the array changes
They are the
children of `ComboBox`, `FlipView` and `ListBox`, and the snippet that names
the property in `NavigationView` (`menuItems`, `footerMenuItems`), `TabView`
(`tabItems`) and `RadioButtons` (`items`)
A `TreeView` takes its items by
`items` and `children` instead (below), not as `TreeViewNode` blocks

Value objects are components too, and fill the property they are written in
They are the brushes, geometry, transforms, transitions, animations (with key
frames and easing), layouts, commands, keyboard accelerators, backdrops, icon
and image sources, shadows, projections and tree nodes: the roots in
`rootClasses` in `scripts/codegen/tables.ts`, each with every class below it
A
root that can be made is a component itself (`GradientStop`)
A snippet takes
the property's name:

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

One written directly among the children of an element (a `Storyboard`) is made
and kept by its component but placed nowhere; reach it with
`{@attach control(storyboard => storyboard.begin())}`

A gradient background can also be written in CSS (`background-image:
linear-gradient(...)` in a `<style>`), which the build turns into the same
brushes; see "Gradients" in `src/css/API.md`

### WebView2

`<WebView2 source="https://..." onnavigationcompleted={...} />` is generated
like the rest
Its bindings are made by `pnpm bindings` after winapp's run
(`scripts/bindings/after-winapp.ts`), since winapp gives the code generator no
WebView2 Core metadata (about 3 MB of bindings)
That step also restores
`Microsoft.Web.WebView2.Core.dll`, and the build ships it with
`WebView2Loader.dll` in `dist/bin/<arch>`: `initWindowsAppSdk` puts that
folder on `PATH`, since the control loads both by name and node.exe's own folder
has neither
It also points `WEBVIEW2_USER_DATA_FOLDER` at
`%LOCALAPPDATA%\winui-svelte\<main script>\WebView2` (the `webViewUserDataFolder` option; a
variable already set wins), because the default folder is beside node.exe in Program Files,
which is not writable, and the browser would not start
A page loads as it
does in any WinUI app, except that WebView2 blocks a `data:` URL as the top
frame
`test/web.test.ts` loads one in a real window; it needs an ordinary
desktop session (a sandboxed process cannot launch the browser, 0x8007139F)

### WebView2 bridge (`winui-svelte/messaging/web-view2`)

A Svelte app and the web content in a `WebView2` talk with the same
request and response frames as every other transport, over
`CoreWebView2.PostWebMessageAsJson` and `WebMessageReceived`
Both are raised on the UI thread, where dynwinrt delivers callbacks

```ts
import { defineMessaging } from "winui-svelte/messaging";
import { webView2Transport } from "winui-svelte/messaging/web-view2";

// control is the WebView2 (the sender of oncorewebview2initialized)
const transport = webView2Transport({ control, allowedOrigins: ["https://app.example"] });
const bridge = defineMessaging<AppProtocol>({ transport });
bridge.onMessage("save", ({ data }) => save(data));
const title = await bridge.sendMessage("title");
transport.dispose();
```

```ts
// in the web page's bundle
import { createPageTransport, defineMessaging } from "winui-svelte/messaging/page";

const bridge = defineMessaging<AppProtocol>({ transport: createPageTransport() });
```

- The transport starts the browser (`EnsureCoreWebView2Async`) and waits for
  it (a control with no `source` does not start on its own, and a page set
  from `oncorewebview2initialized` can be overtaken by the `source` navigation;
  the example loads its page from the first `onnavigationcompleted`); frames sent before it is ready are kept and posted in order
- `dispose()` stops listening, drops the queue and closes the link
- `window.chrome.webview` is in every page WebView2 loads, so the page needs
  no injected script; `addDocumentCreatedScript` is for the scripts an app adds
  of its own
- Every incoming message is parsed as JSON and checked against
  `allowedOrigins` (the origin of the page that posted it); a message that
  fails either is dropped and reported through the listener's `malformed`
  Without `allowedOrigins` every page is trusted, which suits only content the
  app ships; a page that is not the app's own needs the list
- Nothing received is evaluated, and `AreHostObjectsAllowed` is switched off;
  the bridge never calls `AddHostObjectToScript`

| Helper | What |
|---|---|
| `waitForCoreWebView2(control)` | resolves with the `CoreWebView2` once the browser started |
| `executeScript({ control, code })` | runs script in the page and resolves with its JSON value, checked |
| `addDocumentCreatedScript({ control, code })` | runs script before every page script; resolves with the function that removes it |
| `openDevTools(control)` | opens the developer tools window |
| `getCookies`, `setCookie`, `deleteCookie` | the profile's cookies as plain data (`CookieSameSite`) |
| `onPermissionRequested({ control, decide })` | answers permission requests with a `PermissionState` (`default`, `allow`, `deny`) for a `PermissionKind` |
| `onDownloadStarting({ control, pathFor })` | sends a download to a path with no dialog, or cancels it with `null` |
| `onNavigationStarting({ control, isAllowed })` | cancels the navigations `isAllowed` refuses |

`examples/web-bridge` is an app talking to a hosted page, and
`test/web-bridge.test.ts` runs it in a real window; it needs an ordinary
desktop session (a sandboxed process cannot launch the browser, 0x8007139F)

### ListView and GridView

```svelte
<ListView items={rows} key={row => row.id} reorderable keyboardReorder
          onreorder={ids => save(ids)} itemName={row => row.name}
          oncontrol={view => animate(view)} bind:handle bind:selectedKey>
  {#snippet item(row)}
    <ThemeRow {row} />
  {/snippet}
</ListView>
```

| Prop | |
|---|---|
| `items` | the items, in order (an array or a `$state` array) |
| `key` | `(item) => string`: the item's identity, unique in the list. A row is kept while its key is; an item with the same key and new contents reaches the row as the new `item` |
| `item` | the row snippet, given the item; mounted once per realized container |
| `reorderable` | the control's own drag reorder (`canReorderItems`, `canDragItems`, `allowDrop`) |
| `keyboardReorder` | Alt+Up / Alt+Down moves the focused item one place |
| `onreorder` | `(keys: string[]) => void`, after a drag or a keyboard move, the keys in the order the user left. The list keeps that order until `items` changes |
| `itemName` | the accessible name of an item's container |
| `oncontrol` | `(view) => void \| cleanup`: the `ListViewBase` itself, for what the component does not cover (item transitions) |
| `groupBy` | `(item) => string`: shows the items in groups (see "Groups" below) |
| `groupHeader` | the header row snippet of a group, given the `Group` (`{ key, items }`) |
| `bind:selectedKey` | `string \| undefined`: the key of the selected item (for the single selection modes). Set it to select an item, read it for the user's choice; it is cleared when the item goes and follows the item when the items reorder |
| `bind:selectedKeys` | `string[]`: the keys of the selected items in list order, for `Multiple` and `Extended` (`selectedKey` is then the first of them) |
| `bind:handle` | `ListHandle`: `move(key, direction)` (what Alt+Up/Down does), `scrollToKey(key)`, `focus(key)` |

Every other property and event of the control is a prop as on the generated
components (`selectionMode`, `itemContainerStyle`, `ondragitemscompleted`, ...);
`selectedIndex` is an index into `items` and is as good as a key, but the
control's `selectedItem` and `selectedValue` hold the **boxed key**, not the
item (read one with `unboxed`; setting them does not select, use
`selectedKey`)
`itemsSource`, `itemTemplate`, `items` and `children` are the component's
`ItemsView` has no `selectedKey` yet

How it works: the control's items are a vector of **boxed keys** (the
control's drag reorder only commits a move to a list of plain values, not of
rows), its item template is a `ContentControl` slot, and each time a container
reports the key it shows (`ContainerContentChanging`) the `item` snippet is
mounted into the slot (`mountControl`); a container going to the recycle queue
ends its row
So a 1000 item list holds the rows of the containers WinUI has
realized (a screenful and its cache, about 76 for a 640 pixel window), not
1000, and nothing leaks (`test/lists.test.ts` counts rows made and ended)
Rows
are mounted outside the list's own component tree: they do not see its Svelte
context
The key sync touches only keys that came, went or moved (an empty
list is filled in one reset), so the control's item transitions play for
exactly those

#### Groups

```svelte
<ListView items={rows} key={row => row.id} groupBy={row => row.city}>
  {#snippet item(row)}<RowView {row} />{/snippet}
  {#snippet groupHeader(group)}<text-block>{group.key} ({group.items.length})</text-block>{/snippet}
</ListView>
```

`groupBy` arranges the items by a group key: groups follow each other in the
order their first item appears, each group's items in the order of `items`
The list uses WinUI's own grouping: a `CollectionViewSource` with
`IsSourceGrouped` over groups that hold the items, so each header sticks to the
top of the list while its group is in view, and the control's items are the
items only (no header among them)
The `groupHeader` snippet is the row of a
header
A header is not an item: it cannot be selected, and `reorderable` and
`keyboardReorder` are ignored in a grouped list
`selectedKey`, `onreorder`'s
keys and `itemName` only ever hold items
Groups and items that come or go
change the live view in place

WinUI never asks a JavaScript object for `ICollectionViewGroup`, so the group
objects are `ItemsControl`s (WinUI reads their `Items` through `ItemsPath`) and
the header containers are made on `ChoosingGroupHeaderContainer`, where the
group's place in the list gives its key

### TreeView

```svelte
<TreeView items={folders} key={folder => folder.path}
          children={folder => folder.children}
          bind:expandedKeys bind:selectedKey>
  {#snippet item(folder)}
    <FolderRow {folder} />
  {/snippet}
</TreeView>
```

| Prop | |
|---|---|
| `items` | the root items |
| `key` | `(item) => string`: the item's identity, **unique in the whole tree** |
| `children` | `(item) => Item[]`: the items under an item |
| `item` | the row snippet, given the item; mounted once per realized container |
| `itemName` | the accessible name of an item's container |
| `bind:expandedKeys` | `string[]`: the keys of the expanded items, in the tree's order. Set it to open items, read it for what the user opened; a key the tree has no item for is kept |
| `bind:selectedKey` | `string \| undefined`: the key of the selected item (`selectionMode` `Single`, the control's default) |
| `bind:selectedKeys` | `string[]`: the keys of the selected items in the tree's order (`Multiple`); selecting an item selects the items under it, which are in the list too |
| `oncontrol` | `(view) => void \| cleanup`: the `TreeView` itself |

Every other property and event of the control is a prop as on the generated
components
`rootNodes`, `selectedNode`, `selectedNodes`, `selectedItem`,
`itemsSource` and `itemTemplate` are the component's, and so is `children`
(which is not Svelte's snippet here)
The control's own drag reorder is not
supported: a move it makes is undone by the next sync of `items`

How it works: the control's nodes are `TreeViewNode`s whose content is the
item's **boxed key**, so every node a tree needs is made from the items, not
by the app
A node's children are made only when the node is expanded (its key
is in `expandedKeys`) or already were: a collapsed node with children says it
has some it has not made (`hasUnrealizedChildren`) and `children(item)` is
called to know it, and the control's `Expanding` event, which it raises for the
user's click and for the app's `isExpanded` alike, has them made while it
asks
So a tree that is mostly closed holds nodes for what is open, and a
node that is closed after it was open keeps its children, in step with the
items
A node is kept for as long as its item stays under the same parent, so
a reorder, an insertion or a removal changes exactly those nodes (an item that
moves to another parent is a new node, and keeps its expanded state through
its key)
Rows work as in the list: the control draws its nodes in a
`ListView` of its own (the part `ListControl`), which reports each container it
realizes, and the `item` snippet is mounted into that container's slot and
ends when the container is recycled (`test/tree.test.ts`: 2000 roots hold the
rows of about 90 containers)

Selecting is by key as in the list, with one difference: only the items whose
node is made can be selected, so a key whose parent was never opened is not a
selection and is dropped from `selectedKey`; put its ancestors in
`expandedKeys` first
`selectedItem` is not bindable on a `TreeView`: it holds
the control's own nodes, and binding it undoes the key selection

### Window

```svelte
<Window title="My app" backdrop={Backdrop.acrylic} icon={iconPath} appUserModelId={id}
        width={560} minWidth={560} maxWidth={560} minHeight={420} height={640}
        isMaximizable={false} placement={saved} activate={!isBackground}
        onactivechanged={refresh} onboundschanged={report}
        onclosing={hasUnsavedWork} onclosed={exitApplication} theme={WindowTheme.dark}
        titleBarHeight={TitleBarHeight.tall} captionButtons={{ foreground: "#fff" }}
        bind:handle>
  {#snippet titleBar()}...{/snippet}
  ...the page...
</Window>
```

Mount it as the app's root (`mountControl({ component: App, props })` inside `runWindow`'s
`onStart`): the component is the window
`backdrop` is `"acrylic"`, `"acrylicBase"`,
`"acrylicThin"`, `"mica"`, `"micaAlt"`, `"none"` or `"transparent"` (`Backdrop`, also taken by `createWindow`); it can
change while the window is open
WinUI itself shows the theme's solid color
in place of the material while the window is inactive, and restores it on
activation; nothing needs wiring
`"acrylicBase"` and `"acrylicThin"` are
the other two acrylic variants: XAML's `DesktopAcrylicBackdrop` has no kind, so
the window takes `DesktopAcrylicController` as a target instead
(`window.systemBackdrop` reads null; the controller is closed when the backdrop
changes or the window closes)
`"transparent"` shows the desktop through every pixel the content leaves clear,
with per-pixel alpha: the window gets a fully clear composition brush behind
its content (`ICompositionSupportsSystemBackdrop`; the Windows App SDK's
`TransparentTintBackdrop` is in no runtime from 2.3 to 2.6.5 and not in the
metadata restored, 2.2, so it cannot be generated), and the whole window
becomes the window manager's frame (`DwmExtendFrameIntoClientArea` with every
margin -1) with square corners (`DWMWA_WINDOW_CORNER_PREFERENCE` do-not-round),
which also drops the outline and the shadow Windows 11 draws round a rounded
window
Without the frame step the clear pixels read black, not the desktop; it is
applied again whenever `isBorderless` changes, since WinUI's presenter undoes
the corner preference
`window.systemBackdrop` reads null for it
Measured on Windows 11 build 26300 with the Windows App SDK runtimes 2.3 to
2.6.5 installed; no other Windows build has been run, and the corner preference
exists on Windows 11 only
A window on a desktop of its own (a hidden desktop) is never composed by
Windows, so there is nothing to see through to: `test/transparent-window.test.ts`
reads the screen of the ordinary desktop for that reason
Not checked: a filter or a drop shadow (`filter: drop-shadow()`) on content
over a transparent window
The window's own `cornerRadius` clips with an edge that is not anti-aliased, so
round the card's own `corner-radius` instead
Pair it with `isBorderless` and content that sets no background of its own
A floating card over a transparent window:

```svelte
<Window backdrop="transparent" isBorderless isShownInSwitchers={false}>
  <border
    background="#e61f1f1f"
    corner-radius="12"
    padding="16"
    horizontal-alignment="center"
    vertical-alignment="center">
    <text-block foreground="white">Everything around the card is the desktop</text-block>
  </border>
</Window>
```

A `titleBar` snippet is shown above the content
and set as the window's title bar (`setTitleBar`, so it is the drag region and
the controls in it still click); it makes `extendsIntoTitleBar` true unless
given
Sizes are in device-independent pixels (the window's DPI applied);
`placement` is in device pixels (a position, and optionally a size) and wins over
centering, which is the default
`activate={false}` shows the window without
taking focus
`onboundschanged` hears the bounds the window opened with and
then every move or resize (device pixels), so an app that reopens the window
where it was has them before the user touches it
`stateKey` keeps the window where its user leaves it: the bounds (the normal
ones, also while it is maximized), the maximized or minimized state and the
presentation are saved in `%LOCALAPPDATA%\<app>\window-state\<stateKey>.json`,
written a moment after each move, resize or state change and again when the
window closes, and restored before the window first shows
The restored bounds are kept whole inside the work area of the display nearest
to them (a display that is gone, or smaller, never leaves the window off
screen) and are resized to the scale of the display they land on
On the first run, and when the file is missing, corrupt or from another
version, `placement` or the centered default applies; a saved place wins over
`placement`, and a `presentation` prop wins over the saved presentation
`stateKey` is read once, before the window opens
`onclosing` runs when the window is asked to close (the close button, Alt+F4,
`handle.close()`): returning `true` keeps it open (ask the user, then close it
again from code); `onclosed` follows a close that went through
`onscalechanged(scale)` hears a DPI change (the window moved to another
display, or the user changed the display scale); the size limits and regions,
which WinUI takes in device pixels, are set again for it

`theme` is `"light"`, `"dark"` or `"system"` (the default): it sets the
content's requested theme and the caption buttons'
`titleBarHeight` is
`"standard"` or `"tall"` (for a title bar that holds a search box or tabs; it
applies when the content extends into the title bar)
`iconShowOptions` is `"showIconAndSystemMenu"` (the default) or
`"hideIconAndSystemMenu"`: whether the title bar shows the window's icon and
opens the system menu on a click on it (`AppWindowTitleBar.IconShowOptions`;
it is set again to the default when the prop is dropped)
`captionButtons` sets
the colors of the minimize, maximize and close buttons: `foreground`,
`background`, `hover*`, `pressed*` and `inactive*` (each `Foreground` or
`Background`), as `"#rgb"`, `"#rrggbb"`, `"#aarrggbb"` or `"transparent"` (the
parser a color prop uses; other text throws a `TypeError`)
A color left out,
or dropped later, is the system's

`dragRegions` and `passthroughRegions` are rectangles (`{ x, y, width, height }`
in device-independent pixels from the window's top-left corner) that set
InputNonClientPointerSource's caption and passthrough regions: where a press
drags the window, and the parts of it (a search box) that take the pointer
themselves
Without `dragRegions` the `titleBar` snippet is the drag area

`presentation` is `"windowed"` (the default), `"fullScreen"` or
`"compactOverlay"` (a small always-on-top window)
The size limits and
`isAlwaysOnTop` are the windowed presentation's, and are set again when the
window returns to it
A window that is only its content (a pill, an overlay, a splash screen) is made
of the frame props: `isBorderless` (no frame, no title bar; the window keeps its
8 device pixel resize frame, which shrinks the client area and paints a strip
along the top, until `isResizable={false}` takes it away),
`isShownInSwitchers` and `isToolWindow` (no taskbar button or Alt+Tab entry),
`isActivatable={false}` (a click never takes focus), `isClickThrough`,
`isExcludedFromCapture` (black in screenshots and screen sharing),
`isHidden` (opens hidden, hides and shows later) and `cornerRadius` (clips the
window to a rounded rectangle; the edge is not anti-aliased, so on a
transparent window round the card's own `corner-radius` instead, which is)
A prop left out leaves the window as it is, and dropped again it puts the
window back
`createWindow` takes them too
`handle.setShownInSwitchers(isShown)` does not throw for a window that has no
taskbar button (WinUI answers 0x80004001 there); `hideToTray` uses it
A window with a transparent background (per-pixel alpha) is
`backdrop="transparent"`; no web API makes a window transparent (Tauri and
Electron take `transparent: true` when they create theirs), so the value is
WinUI's alone
`isActivatable` is read again whenever it changes, so an overlay can take focus
while text is selected and give it up afterwards: `isActivatable={false}` sets
`WS_EX_NOACTIVATE`, `true` or a dropped prop clears it (call `handle.activate()`
to take focus once it is set)

`sizeToContent` (`"none"`, the default, `"width"`, `"height"` or `"both"`; the
`SizeToContent` set) makes the window follow its content: after every layout
pass the root's desired size, plus the frame, is clamped to `minWidth`,
`minHeight`, `maxWidth` and `maxHeight` and applied with one
`AppWindow.MoveAndResize`, so the size and the position never show half done
`anchor` (`"topLeft"`, the default, `"topRight"`, `"bottomLeft"` or
`"bottomRight"`; the `WindowAnchor` set) is the corner that stays where it is:
anchored bottom-right, a window whose content grows taller grows upward
A side the content sets ignores the `width` or `height` prop
The scale is applied (the desired size is in device-independent pixels), so a
move to a display with another scale refits
The root is measured with `FrameworkElement.DesiredSize` on `LayoutUpdated`:
a `ResizeObserver` reports the laid-out size, which a stretched root keeps
while its content grows
`createWindow` takes both props

```svelte
<Window
  isBorderless
  isActivatable={false}
  sizeToContent="height"
  anchor="bottomRight"
  width={504}
  bind:handle
>
  <Card />
</Window>
```

```ts
// device pixels, from the work area of the display the user is on
handle.dock({ anchor: "bottomRight", inset: 6 })
```

`handle.dock({ anchor, inset, display })` moves the window against a corner of
a display's work area (`DisplayArea.WorkArea`: the display without the
taskbar) with one `MoveAndResize`; `inset` is in device pixels (0 by default)
`display` is `"active"` (the default: the display of the foreground window),
`"current"` (the one the window is on) or `"primary"` (the `DockDisplay` set)
A window moved to a display with another scale goes there first and is docked
at the size it has after Windows rescaled it
`dockWindow({ appWindow, ... })` and `displayAreaOf({ appWindow, display })`
(`winui-svelte/window`) do the same for a bare `AppWindow`
The arithmetic is plain functions (`anchoredBounds`, `dockedBounds`,
`fittedBounds` in `src/window/anchor.ts`) over device pixels

`handle.geometry` is the window's own `window.outerWidth`, `outerHeight`,
`screenX`, `screenY`, `devicePixelRatio`, `resizeTo(width, height)`,
`resizeBy`, `moveTo(x, y)` and `moveBy`, in CSS pixels (WinUI's
device-independent pixels at the window's scale), over `AppWindow.Resize` and
`AppWindow.Move`
A process has many windows, so there is no `window` global for them

`handle.windowControlsOverlay` is `navigator.windowControlsOverlay` for the
window: `visible` (the content extends into the title bar),
`getTitlebarAreaRect()` (the part of the title bar the content may use, from
the system's icon to the caption buttons, as `x`, `y`, `width`, `height`,
`left`, `top`, `right` and `bottom` in CSS pixels, all zeros while `visible`
is false) and `ongeometrychange` (a `geometrychange` event with
`titlebarAreaRect` and `visible`, fired when the area or `visible` changes)
It reads `AppWindowTitleBar.LeftInset`, `RightInset` and `Height` (device
pixels, divided by the scale) and the client width; the left inset is the
caption buttons in a right-to-left window
It follows the window from the first read of the property until the window
closes, on `AppWindow.Changed` (a size, DPI or presenter change)
Limits: the CSS `env(titlebar-area-x)`, `titlebar-area-width` and the rest are
not supported (WinUI has no run-time lengths, so the translator reports them
as an error); lay the title bar out from `getTitlebarAreaRect()` instead

`owner` (another window's `WindowHandle`) and `isModal`
(blocks the owner until this window closes) are read once, before the window
opens; `createWindow` takes them too
The `owner` link is a Win32 call
(`SetWindowLongPtrW`) in `native.ts`

`bind:handle` gives a `WindowHandle`: `window`, `appWindow`,
`presenter`, `scale`, `close()`, `restore()`, `minimize()`, `maximize()`,
`bringToFront()`, and the file dialogs `pickFile()`, `pickFiles()`,
`pickFolder()` and `saveFile()` (see App services)
`appUserModelId` names the
process for the taskbar (it is process-wide: read once, before the window
opens)

## Page navigation (`winui-svelte/components`)

`Frame.SourcePageType` takes a page type XAML registered, which a Node host
cannot give it
`Navigator` (`src/components/hand-written/navigation`) does
what a `Frame` does with Svelte components as the pages: it mounts the page
into a `ContentControl`, keeps the back and forward history, and lets the
control's navigation transition play when the page changes

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
<Button disabled={!navigator?.canGoBack} onclick={() => navigator?.goBack()}>Back</Button>
```

```ts
interface NavigatorHandle {
  // `page` is a Svelte component, or { component, cacheMode }. `params` are
  // its props; they are required when the page has props that need them.
  navigate<Params extends object>(options: NavigateOptions<Params>): void;
  goBack(): void; // does nothing without a page behind
  goForward(): void; // does nothing without a page ahead
  readonly canGoBack: boolean; // reactive, like the two below
  readonly canGoForward: boolean;
  readonly current: NavigationEntry | null; // { page, params, cacheMode }
}
```

- Props of the component: `bind:handle`; `onready(handle)`, called once the
  control is in place, where the first page is navigated to;
  `onnavigated({ entry, mode })`, with `mode` a `NavigationMode` (`new`,
  `back`, `forward`); `cacheSize` (default 10); `transition`, a snippet with
  one of the `...NavigationTransitionInfo` components (it is the
  `DefaultNavigationTransitionInfo` of the control's `NavigationThemeTransition`;
  `SuppressNavigationTransitionInfo` plays none); and the props of
  `ContentControl`, except those the navigator owns (`content`,
  `contentTransitions`, `contentTemplate`)
- A page is a plain component; its props are the `params`
  It is made when
  the user goes to it and ends (its effects and controls) when the cache lets
  it go, as an items row does
- `NavigationCacheMode` is WinUI's: `DISABLED` (the default) ends the page
  when the user leaves it, so going back makes a new one; `ENABLED` keeps it
  mounted, with its state, while it is among the `cacheSize` most recently
  shown enabled pages; `REQUIRED` keeps it for as long as the history holds
  it
  A page keeps its place in the history by entry, not by component:
  navigating to the same component twice makes two entries, each with its own
  page
- A new `navigate` after `goBack` drops the pages that were forward, and ends
  the ones of them that were kept
- With a `NavigationView`, put the navigator in the view's content, go to the
  page of the chosen item in `onSelectionChanged`, go back in
  `onbackrequested`, and select the item of `handle.current` when the history
  moves; `examples/navigation` does this

## Overlays (`winui-svelte/components`)

A control that opens over the window takes `open` and `target` (and a dialog
`onresult`) besides its own props; the table `overlayHosted` in
`scripts/codegen/tables.ts` names them and the host each uses
(`src/components/hand-written/overlay`)
They are `ContentDialog`, and the
flyouts: `Flyout`, `MenuFlyout`, `MenuBarItemFlyout`, `CommandBarFlyout`,
`TextCommandBarFlyout`, `DatePickerFlyout`, `TimePickerFlyout`,
`PickerFlyout` and `ListPickerFlyout`

```svelte
<Button>
  Options
  {#snippet flyout()}
    <MenuFlyout bind:open={isMenuOpen}>...</MenuFlyout>
  {/snippet}
</Button>

<StackPanel>
  <Flyout bind:open={isTipOpen}>
    <TextBlock>Next to the panel</TextBlock>
  </Flyout>
  <ContentDialog
    bind:open={isDeleteOpen}
    title="Delete?"
    primaryButtonText="Delete"
    closeButtonText="Cancel"
    onresult={result => result === ContentDialogResult.Primary && remove()}
  >This cannot be undone.</ContentDialog>
</StackPanel>
```

- `open` (`bind:open`) is `true` while the control is open
  Setting it opens
  or closes the control; the user closing it (light dismiss, Escape, a choice,
  the dialog's buttons) sets it back to `false`
  Left unset, nothing opens
  A button opens the flyout in its `flyout` snippet itself when it is
  clicked, so an `onclick` that also sets `open` to `true` is harmless: a
  flyout that is already open stays open
- `target` is the element the control opens next to: a flyout through
  `ShowAt`, a dialog in that element's window (its `XamlRoot`)
  It defaults to
  the element the control is written in (`placedControl`): the `Button` whose
  `flyout` snippet holds it, or the panel it is a child of
  A control written
  directly in the window's content has no element above it, so give it
  `target`
  A flyout is no element, so a panel leaves it out of its children
- An overlay asked to open before its element is on screen opens when the
  element loads, and not at all when closed first
  One still open when its
  component goes is closed
- `onresult(result)` of a `ContentDialog` gets the button the user chose
  (`ContentDialogResult.Primary`, `Secondary`) and `None` for the close
  button, Escape and `open = false`
  `onclosed` and the control's other events
  are the generated ones
- WinUI shows one `ContentDialog` at a time (a second `ShowAsync` fails with
  0x80000019)
  Dialogs asked for together open in the order asked, each when
  the one before has closed; `open` stays `true` while one waits, and setting it
  to `false` first removes it from the line
  The line is one for the thread, so
  a dialog of a second window also waits
- `Flyout`'s content is a control: write `<TextBlock>` in it, not bare text

## Value objects, attached slots and observed state (`winui-svelte/components`)

### Value objects

Classes that are no element but hold what an element shows are components too
Each is a root of the generator (`rootClasses` in `scripts/codegen/tables.ts`),
and the property that holds it takes a snippet of that name:

| Component | Goes in | Snippet |
|---|---|---|
| `SwipeItems` (its children are the items), `SwipeItem` | `SwipeControl` | `leftItems`, `rightItems`, `topItems`, `bottomItems` |
| `MapElementsLayer` (`mapElements`), `MapIcon` | `MapControl` | `layers` |
| `TextHighlighter` | `TextBlock`, `RichTextBlock` | `textHighlighters` |
| `RatingItemFontInfo`, `RatingItemImageInfo` | `RatingControl` | `itemInfo` |

```svelte
<SwipeControl>
  <TextBlock>Message</TextBlock>
  {#snippet leftItems()}
    <SwipeItems mode={SwipeMode.Execute}>
      <SwipeItem text="Delete" oninvoked={remove} />
    </SwipeItems>
  {/snippet}
</SwipeControl>

<TextBlock>
  Find the needle
  {#snippet textHighlighters()}
    <TextHighlighter background="#ffee00" ranges={[{ startIndex: 9, length: 6 }]} />
  {/snippet}
</TextBlock>
```

- A class that is a collection of controls itself (`SwipeItems`) takes them as
  its children: the renderer puts the children of a control that has
  `insertAt` and no other place for them into it
- `TextHighlighter.ranges` is hand-written
  (`src/components/extensions/text-highlighter.ts`): WinUI's `Ranges` is a
  read-only collection of structs
  The array replaces the ranges it holds
- `MapControl.layers` is settable, so the snippet fills the collection the map
  holds when it holds one

Not components, on purpose: the scroll snap points (`ScrollSnapPoint`,
`RepeatedScrollSnapPoint`, ...: their factories take arguments, so none has a
default constructor)
`scripts/codegen/not-components.ts` lists every class of
WinUI's metadata that is not a component, with the reason, and
`scripts/codegen/coverage.test.ts` fails for one that is not sorted

### Attached slots

An attached property whose value is a control takes a snippet as well
(`slots` of `attachedOwners`):

- `toolTip` (every element): `{#snippet toolTip()}<TextBlock>Save</TextBlock>{/snippet}`
  A string, number or boolean prop works as before

The component renders a `<property name="tool-tip-service.tool-tip">`
element; a property element named `owner.property` fills the attached property
through the owner's `set<Property>`, as the attribute of that name does, and
gives it back (`null`) when it goes
The component registers the owner, so no
app code does

`FlyoutBase.AttachedFlyout` has no prop of its own: a prop of every framework
element would add `FlyoutBase` (a binding module) and a snippet block to every
component, more than the one-Button bundle budget allows
Use the `attached`
prop: `attached={[FlyoutBase, "AttachedFlyout", flyout]}`

The animation target is attached on every timeline: `storyboardTarget`,
`storyboardTargetName` and `storyboardTargetProperty` call
`Storyboard.SetTarget`, `SetTargetName` and `SetTargetProperty`

### A refused change

A bound property (`bind:isOn`, `bind:isChecked`, `bind:value` and the rest) is
two-way: the user's change is written to the bound prop, and the prop's value
is written to the control
When the app refuses the change (a function binding whose setter leaves the
state as it was, or a handler that puts it back) the prop does not change, so
nothing would write it to the control; after the app has been told, in the next
Svelte tick, the control is set back to what the prop holds, so a refused
toggle snaps back with no `await tick()` and no write to the control in the
handler
`test/refused-toggle.test.ts` proves it in a window for a `ToggleSwitch` and a
`CheckBox`

### Observed state

Read-only state WinUI reports by an event is a bindable prop the control
writes and the app only reads
It holds the control's value as soon as the
control is made, and follows each time the event is raised; what the prop is
given is never written to the control
The table is `observedProperties` in
`scripts/codegen/tables.ts`, `Class.Property` with the events that say it
changed:

| Component | Props (event) |
|---|---|
| `NavigationView` | `displayMode` (`DisplayModeChanged`) |
| `Frame` | `canGoBack`, `canGoForward`, `backStackDepth` (`Navigated`) |
| `ScrollViewer`, `ScrollView` | `horizontalOffset`, `verticalOffset`, `zoomFactor` (`ViewChanged`) |
| `ScrollView` | `extentWidth`, `extentHeight` (`ExtentChanged`), `state` (`StateChanged`) |
| `ScrollPresenter` | `state` (`StateChanged`) |
| `Popup` | `actualPlacement` (`ActualPlacementChanged`) |
| `TwoPaneView` | `mode` (`ModeChanged`) |
| `TextBlock`, `RichTextBlock`, `RichTextBlockOverflow` | `isTextTrimmed` (`IsTextTrimmedChanged`) |

```svelte
<NavigationView bind:displayMode>
  ...
</NavigationView>
{#if displayMode === NavigationViewDisplayMode.Minimal}...{/if}
```

Not observed: the properties of `FrameworkElement` (`actualWidth`,
`actualTheme`, `isLoaded`), which would put a subscription in every component

### Bindings for the next features

`featureClasses` in `scripts/codegen/tables.ts` lists the classes `pnpm bindings`
makes though nothing in `src/` imports them yet: `FullScreenPresenter`,
`CompactOverlayPresenter`, `DesktopAcrylicController`, `MicaController`,
`SystemBackdropConfiguration`, the Windows App SDK `FileSavePicker`,
`AppNotificationManager`, `AppNotification` and its builders,
`ConnectedAnimationService`, `InMemoryRandomAccessStream`, `DataWriter` and
`MediaSource`

## App services (`winui-svelte`, `winui-svelte/window`)

What an app reads from Windows and asks of it, beyond controls
All of it
runs on the UI thread, unpackaged (started from `node.exe`), except what the
last two lists say

### Reactive readers of an element (`winui-svelte`)

```ts
// Put `.attach` after @attach on the element; read the rest where needed.
// All reactive, and reset when the element goes.
const size = elementSize();     // size.width, size.height: ActualWidth/Height,
                                // device-independent pixels, 0 before layout;
                                // size.desiredWidth, size.desiredHeight: what
                                // the content asks for (a stretched root panel
                                // is as tall as its window, so a window sized
                                // from its content reads these)
const theme = elementTheme();   // theme.current: ElementTheme.Light | Dark,
                                // undefined before the element is made

// Focus a control like element.focus() on the web. `state` is how focus is
// said to arrive: "programmatic" (default), "keyboard" (draws the focus
// visual) or "pointer". Returns false when the control cannot take focus.
function focusElement(options: {
  control: Focusable;
  state?: FocusKind;
}): boolean;
```

```svelte
<StackPanel {@attach size.attach} {@attach theme.attach}>
  {#if size.width < 480}<NarrowLayout />{:else}<WideLayout />{/if}
</StackPanel>
```

The control for `focusElement` comes from `elementRef().current` or
`@attach control(...)`
Focus lands only once the control is shown, in an
active window: a call earlier returns `false`

### System settings (`winui-svelte/window`)

```ts
const settings = systemSettings();   // once, on the UI thread
settings.accentColor;       // "#rrggbb": any color prop takes it
settings.textScaleFactor;   // 1 is 100%, 1.5 is 150%
settings.isAnimationEnabled;
settings.isHighContrast;    // a contrast theme is on
settings.isDarkTheme;       // Windows is in dark mode
settings.isTransparencyEnabled;
```

Over `Windows.UI.ViewManagement.UISettings`
Each field is read live and is
reactive: it updates on `ColorValuesChanged`, `TextScaleFactorChanged` and
`AnimationsEnabledChanged` (and `HighContrastChanged` of
`Windows.UI.ViewManagement.AccessibilitySettings`, for `isHighContrast`), and
the subscription lasts only while an effect
reads it
`UISettings` raises its events off the UI thread, so the change is
handed to it through a dispatcher captured when `systemSettings()` is called

### Media queries: `mediaQuery`, `matchMedia` (`winui-svelte/window`)

```ts
const isReduced = mediaQuery("(prefers-reduced-motion: reduce)");   // once, on the UI thread
isReduced.matches;                    // reactive: read it in markup, $derived or $effect

installMatchMedia();                  // opt in, once, before anything calls window.matchMedia
const list = matchMedia("(prefers-color-scheme: dark) and (min-width: 600px)");
list.matches;
list.addEventListener("change", event => console.log(event.matches));
```

One evaluator and one reactive source of Windows' settings serve the `@media`
rules of a stylesheet, `mediaQuery` and `matchMedia`: the grammar is Media
Queries 4 (types, `not`, `only`, `and`, `or`, comma lists, range syntax, px, em,
rem, dppx, dpi) and the features are the table in
[src/css/API.md](src/css/API.md) (preferences, window and monitor size,
resolution, input, display)
`matchMedia` returns a `MediaQueryList` with `matches`, `media`, `onchange`,
`addEventListener("change")` and the legacy `addListener`, and listens to Windows
only while it has a listener
`installMatchMedia()` puts it on `globalThis` (and `window`, where there is one);
nothing is installed at import time, and it returns the function that takes it
away
Libraries that call `window.matchMedia`, such as Svelte's `MediaQuery` from
`svelte/reactivity`, work once it is installed: the Vite plugin makes that class
read the installed `matchMedia` when it is made (before it, it holds nothing)

Pointing devices are read from Windows.Devices.Input, by the reader `winui-svelte/devices/input` shares (`readInputCapabilities`); HDR and the colour gamut from the display configuration and the monitor's EDID, the metered connection from `NetworkInformation`; where Windows does not tell, the answers are defaults an app can replace:
`installMatchMedia({ inputs: { viewport, scale, devices, presentation, isHdr,
gamut, isMetered }, watch })` takes the readers (and, in `watch`, the events that
flip them)
The width and height of `matchMedia` are those of the primary monitor until the
app supplies a window's

### Themes, high contrast and reduced motion

- The theme follows Windows: a window's `theme` is `WindowTheme.system` by
  default (`light` and `dark` override it), its content and caption buttons
  follow the system as it changes, and Mica and acrylic follow the content's
  actual theme
- Theme dictionaries (`@media (prefers-color-scheme)`, `light-dark()`) are
  re-read by WinUI on a theme change; a rule under `prefers-color-scheme` reads
  the element's `ActualTheme` and restyles on `ActualThemeChanged`
- A contrast theme applies the `HighContrast` dictionary and the system
  colors, and `@media (forced-colors: active)` rules apply while it is on
- `prefers-reduced-motion` is honoured by CSS transitions and animations
  (automatically, unless the element has the class `winui-motion-always`) and by
  Svelte's transitions

### File and folder dialogs (`WindowHandle`)

```ts
const path = await handle.pickFile({
  title: "Open a note",
  startIn: PickerLocation.documents,   // or startFolder: "C:\notes"
  fileTypes: [".txt", ".md"],          // "*" or left out: every file
});                                    // string, or null when cancelled
const paths = await handle.pickFiles({ fileTypes: [".png"] });  // []: none
const folder = await handle.pickFolder({ title: "Choose a folder" });
const target = await handle.saveFile({
  suggestedFileName: "note",
  defaultFileExtension: ".txt",
  fileTypeChoices: { text: [".txt"], markdown: [".md"] },
  shouldPromptOverwrite: true,
});
```

They wrap the Windows App SDK pickers (`Microsoft.Windows.Storage.Pickers`:
`FileOpenPicker`, `FileSavePicker`, `FolderPicker`), which take the window's
`WindowId` (`appWindow.id`) so the dialog opens over that window
The older
`Windows.Storage.Pickers` classes need an `IInitializeWithWindow` call and are
not used
All take `PickerOptions`: `title`, `commitButtonText`, `startIn`
(`documents`, `computer`, `desktop`, `downloads`, `music`, `pictures`,
`videos`), `startFolder` (a path, wins over `startIn`) and `settingsIdentifier`
(dialogs sharing it open where the user last chose)
The dialog is modal to
its window; the promise settles when it closes
A path is all that comes back:
read and write the file with `node:fs`

### App lifecycle (`winui-svelte/app`)

```ts
import { ensureSingleInstance, notify, relaunch, restartAfterCrash } from "winui-svelte/app";

const single = ensureSingleInstance({
  key: "com.example.notes",
  window: mainWindow,
  onRedirect: ({ arguments: args }) => openFile(args[0]),
});
if (!single.isPrimary) {
  exitApplication();   // its arguments were handed to the first copy
}

notify({
  title: "Saved",
  body: "note.txt",
  arguments: { file: "note.txt" },
  onInvoked: ({ arguments: pairs }) => reveal(pairs.get("file")),
  displayName: "Notes",
  iconPath: "C:\notes\icon.png",
  appUserModelId: "com.example.notes",
});

relaunch({ arguments: ["--after-update"], instance: single });
restartAfterCrash({ arguments: ["--recovered"] });
```

An opt-in subpath: an app that does not import it does not bundle it

- `ensureSingleInstance` is a named pipe per key and user
  (`\\.\pipe\winui-svelte-<hash of the key and the user's SID>`), served
  with Node's `net` from a worker thread, because the UI thread's own Node
  loop never turns
  The first copy to call it serves the pipe and is the primary; a later copy
  sends one JSON line, `{ arguments, workingDirectory }`, and resolves with
  `isPrimary: false`
  `onRedirect` runs on the UI thread, after the primary's dispatcher timer
  drains the worker's port, with the later copy's `arguments` (its
  `process.argv` after the script) and `workingDirectory`
  Pass `window` (a `WindowHandle`) to have it brought to the front first
  It works unpackaged and from `node.exe`, with no Windows App SDK call
  The primary must call it from `runWindow`'s `onStart` or later (it needs
  the dispatcher queue); a later copy may call it at any time
  In a worker thread `process.argv` holds only the script, so start the
  worker with the `argv` option to pass the command line through
  Security: the pipe is reachable by the current user only (the default
  pipe permissions, the SID in the name, and Node's refusal of remote
  clients); a message larger than 64 KiB is dropped, input that is not the
  expected shape is ignored, and nothing received is ever run
  The pipe goes with the process: there is nothing to clean up
  Use a key no other app would, such as a reverse-domain name
- `notify` is `AppNotificationBuilder` and `AppNotificationManager.Show`
  Unpackaged apps must register first: the first call does, with
  `displayName` and `iconPath` (both or neither), and listens for clicks with
  that call's `onInvoked`
  `appUserModelId` is the window's `appUserModelId`
  (`joinAppUserModel`): give both the same id
- **`notify` from `node.exe` is not known to work.** It is written to
  Microsoft's documented unpackaged path and unit-tested on stand-ins, and the
  platform may refuse a process with no package identity (no notification, or
  a click that cannot start the app once it has exited)
  `test/app.test.ts` reports what `notify` did; run it in a desktop session
  before relying on it
  With package identity (an MSIX or sparse package) it is the supported case
  `ensureSingleInstance` needs no identity: `test/app.test.ts` starts a real
  second copy and checks that the first hears its arguments
- `activateInstance({ key, activation })` is for a process that is not the
  app (a tray, a launcher): it sends the same JSON line to the copy that
  serves `key` and resolves with true, or with false when no copy runs
  Unlike a later copy it never claims the pipe, so it cannot become the
  first copy by mistake
  The running copy's `onRedirect` receives `activation`
- `launchApp({ command, arguments, workingDirectory })` starts a program
  that outlives the caller: detached, no console window, no shared handles
- `activateOrLaunch({ key, activation, launch })` is the two together: it
  activates the running copy, or else starts the app with `launch`, and
  resolves with true for the first and false for the second
- `relaunch({ arguments })` starts the same Node with the same flags, entry
  script (`process.argv[1]`) and then `arguments`, detached, and calls
  `exitApplication`, so the new copy outlives this one
  Pass `instance` (the `ensureSingleInstance` result) to release the claim
  first; otherwise the new copy finds the old one still serving the key and
  redirects to it
  An app whose windows run in a worker thread passes `entryScript`, the script
  that starts the process, because `process.argv[1]` there is the worker's
- `restartAfterCrash({ arguments, conditions })` is
  `RegisterApplicationRestart`: Windows starts the same Node and entry
  script with `arguments` after a crash, a hang, an update that closes the
  app or a reboot for one; `conditions` is a subset of `RestartCondition`
  (`crash`, `hang`, `update`, `reboot`; all by default)
  Limits: no callback (a crashed Node cannot run code, so
  `RegisterApplicationRecoveryCallback` is not offered); Windows restarts
  only an app that ran for 60 seconds; after a crash or a hang the user is
  offered the restart, and only after an update is it automatic; a normal
  exit is never restarted; a command line too long for Windows throws
  `test/app.test.ts` checks the registration and that a normal exit starts
  nothing, and `relaunch` with a real second process (no crash is caused)

### Activation (`winui-svelte/app/activation`)

Starting the app from a link, a file or sign-in, without an installer
An opt-in subpath: an app that does not import it does not bundle it, and
nothing is written to Windows until a registration function is called

```ts
import {
  ActivationKind,
  installProtocolHandlers,
  launchAtLogin,
  registerFileTypes,
  startActivation,
} from "winui-svelte/app/activation";

installProtocolHandlers();
navigator.registerProtocolHandler("note", "https://notes.example/open?uri=%s");
registerFileTypes({ id: "com.example.notes", extensions: [".note"] });
launchAtLogin({ id: "com.example.notes", isEnabled: true });

const single = startActivation({
  key: "com.example.notes",
  window: mainWindow,
  extensions: [".note"],
  onActivation(event) {
    if (event.kind === ActivationKind.protocol) open(new URL(event.uri));
    if (event.kind === ActivationKind.file) openFiles(event.files);
  },
});
if (!single.isPrimary) {
  exitApplication();
}
```

| Web API or extra | Windows | Notes |
|---|---|---|
| `navigator.registerProtocolHandler(scheme, url)` | `HKCU\Software\Classes\<scheme>` with `URL Protocol` and `shell\open\command` | `url` must hold `%s` (`SyntaxError` otherwise) and is not used further: the handler is always this app |
| `navigator.unregisterProtocolHandler(scheme, url)` | deletes that key | only a key the package wrote; another program's is left alone |
| `registerFileTypes({ id, extensions, description })` | a ProgID `<id><extension>` and the extension's `OpenWithProgids` | the app is listed in Open with; the default stays the user's choice |
| `unregisterFileTypes({ id, extensions })` | deletes both and the empty keys left | returns the extensions removed |
| `launchAtLogin({ id, isEnabled, arguments })` | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value `id` | listed in Settings, Apps, Startup; the start arrives as `startup` |
| `getLaunchAtLogin({ id })` | reads that value | `{ isEnabled, commandLine }`; the user's switch in Settings is not read |
| `startActivation({ key, onActivation })` | `ensureSingleInstance` and the command line | one `ActivationEvent` per start or redirect |

- `ActivationEvent` is a union on `kind` (`ActivationKind`, also from
  `winui-svelte/enums`): `launch` (started by hand), `file` (`files`, absolute
  paths of existing files), `protocol` (`uri`, `scheme`), `startup` (started
  at sign-in), `redirect` (a later copy with nothing to open) and `jumpList`
  (`taskId`, a task of the jump list was chosen; see Jump list tasks) and
  `alarm` (`alarm`, an alarm of `winui-svelte/app/schedule` went off; it also
  reaches `onAlarm`)
  Every event has `isRedirect`, `arguments` and `workingDirectory`; a link
  sent by a later copy is `protocol` with `isRedirect: true`
- An alarm wins over a jump list task, a jump list task wins over a link, a link wins over files, files win over the startup marker; an argument
  that fits none stays in `arguments`
  Arguments are checked with a schema (up to 1024 of them, up to 32767
  characters each, no NUL); a failure goes to `onError`, the rest go on
- Events arrive in order, one at a time, in the first copy; the later copy
  gets `isPrimary: false` and exits
  Redirects are also handed to `launchQueue.enqueueActivation` when you pass
  `launchQueue`; the first start's command line reaches `launchQueue` through
  `installLaunch`
- The command Windows runs is this process's `node.exe`, its flags and its
  entry script, then `"%1"`; pass `command: { program, arguments }` for a
  bundled executable
  The Windows App SDK's `ActivationRegistrationManager` takes an executable path
  and no arguments, so for `node.exe` it cannot name the script; the registry route is the one it writes underneath, and needs
  no package identity
- Security: only `HKEY_CURRENT_USER` is ever opened, never
  `HKEY_LOCAL_MACHINE`
  Schemes follow RFC 3986 (a letter, then letters, digits, `+`, `-` and `.`,
  two characters or more) and `http`, `https`, `file`, `ftp`, `mailto`, `ms-*`
  and the other system and browser schemes are a `SecurityError`; so are
  extensions that run code (`.exe`, `.bat`, `.js`, `.lnk` and so on)
  Every key the package creates carries a `WinuiSvelte` value, and it
  overwrites or deletes only keys that carry it; a scheme or ProgID that
  another program owns is an `InvalidStateError`
  A received link is data: it is validated (no control characters, 8192
  characters at most) and handed to your code, never run
  Windows can pass a quote in a link through `"%1"` unescaped, so treat the
  whole of `uri` as untrusted
- Needs packaging for: the share target and a default-app claim (a package
  manifest declares them); unpackaged, the app is offered in Open with and the
  user picks the default
- `installProtocolHandlers()` returns the function that removes the two
  navigator methods; the registrations stay until you unregister them
  Each registration function takes `registry` (a fake in tests) and `command`
- `src/app/activation/native.test.ts` registers a protocol, a file type and a
  startup entry under HKCU with a unique name, reads them with `reg query`,
  removes them and checks nothing is left, even when it fails;
  `test/activation.test.ts` starts real second copies with a link, a file and
  nothing, and checks the first hears each as one event

### Jump list tasks (`winui-svelte/app/jump-list`)

Entries in the Tasks section of the taskbar button's right-click menu
(`ICustomDestinationList`, `IObjectCollection` and `IShellLink`)
No package identity is needed; an opt-in subpath
Thumbnail toolbar buttons cannot be built from Node (their click is a sent
message that no hook receives), so a task is the way to put a command there

```ts
import { startActivation } from "winui-svelte/app/activation";
import { setJumpListTasks } from "winui-svelte/app/jump-list";

const list = setJumpListTasks({
  tasks: [
    { id: "new-note", title: "New note", arguments: ["--new"] },
    { id: "inbox", title: "Open inbox", arguments: ["--inbox"], icon: "inbox.ico" },
  ],
});

startActivation({
  key: "com.example.notes",
  window: mainWindow,
  onActivation(event) {
    const task = list.taskOf(event);
    if (task?.id === "new-note") newNote();
  },
});
```

- `setJumpListTasks({ tasks, appUserModelId, command })` replaces the Tasks
  of the list and returns `{ tasks, taskOf(event) }`; `tasks` is a `const`
  generic, so `task.id` is the union of your ids
- `clearJumpList({ appUserModelId })` deletes the whole list
- A `JumpListTask` is `{ id, title, arguments, description, icon, iconIndex,
  workingDirectory }`; `id` is letters, digits, `_`, `.` and `-`, 64 at most,
  and unique; `icon` is a file path (`PictureSource`, but a `data:`, `http(s)`
  or `ms-appx` URI is a `TypeError`): an .ico, or an .exe or .dll with
  `iconIndex`
- A click starts `command` (this process's Node and entry script by default,
  as `registerFileTypes` does; a bundled executable passes its own) with the
  marker `--winui-svelte-jump-list=<id>` and then the task's `arguments`,
  quoted for `CommandLineToArgvW`
  `startActivation` hands that to the running copy through the single
  instance redirect as a `jumpList` event: `taskId` is the id and `arguments`
  are the task's own; a first start gets the same event with `isRedirect:
  false`
- The list belongs to the process's AppUserModelID and Windows shows nothing,
  without an error, when a window has another; so the call throws when the
  process has none (give `<Window>` an `appUserModelId`, or call
  `joinAppUserModel`) or when `appUserModelId` differs from it
- Keep the tasks static, as Microsoft advises: set them once at start
- Call it on a thread with COM (the UI thread of a window has it)
- `src/app/jump-list/native.test.ts` commits a list under a unique
  AppUserModelID in the test process, checks that Windows wrote its
  custom destinations file, and deletes the list, even when it fails

### Shell verbs (`winui-svelte/app/shell`)

What Explorer's context menu does, from code
There is no web API for these; the names follow the launcher helpers of
`winui-svelte/data-transfer`, which stay the home of `launchUri`,
`launchFile`, `openFolder` and `revealInExplorer`
An opt-in subpath: an app that does not import it does not bundle it

```ts
import { createShortcut, openWith, readShortcut, registerAppPath, trash } from "winui-svelte/app/shell";

const result = trash({ paths: ["C:\\Users\\me\\old.txt"] });
if (!result.ok) console.warn(result.reason, result.message);

createShortcut({
  path: "C:\\Users\\me\\Desktop\\Notes.lnk",
  target: "C:\\Apps\\notes.exe",
  arguments: ["--open", "my notes.txt"],
  workingDirectory: "C:\\Apps",
  icon: { path: "C:\\Apps\\notes.exe", index: 0 },
  description: "Open my notes",
});
const link = readShortcut({ path: "C:\\Users\\me\\Desktop\\Notes.lnk" });
await openWith({ path: "C:\\Users\\me\\photo.png" });
registerAppPath({ name: "notes", program: "C:\\Apps\\notes.exe" });
```

- Every verb returns `{ ok: true }` or `{ ok: false, reason, message }`;
  `reason` is a `ShellFailure` (`invalid`, `not-found`, `exists`,
  `owned-by-another`, `aborted`, `failed`)
- These act on the user's own files; they check and then act, and none
  asks the user first
- Paths are data: each must be a full path with no control character and not a
  device path; none is built into a command line
- `trash` sends to the Recycle Bin (`SHFileOperationW` with
  `FOF_ALLOWUNDO`) and never deletes for good; when Windows would have to
  (a drive without a bin, a file too big for it) it asks, and nothing goes
  unless the user agrees; all the paths are checked before any is touched
- `openWith` shows the Windows "Open with" list for a file
  (`LauncherOptions.DisplayApplicationPicker`), so it takes a file and never a
  program; it opens a dialog and is only unit-tested with a fake
- `createShortcut` writes only the `.lnk` file (`IShellLink` and
  `IPersistFile`); each argument is quoted by the same rule as the
  activation registrations, and an existing file is kept unless
  `shouldOverwrite` is set; the target is not required to exist
- `readShortcut` gives the target as stored, without searching for a moved
  one and without running anything
- `registerAppPath` writes a key under `HKEY_CURRENT_USER` (App Paths) with a
  marker value, only when the key is free or the package made it;
  `unregisterAppPath` removes only a key with the marker; the name is an
  identifier that is not a name Windows or a common tool answers to, and the
  program is a full path ending in `.exe`; the machine-wide hive is out of reach
- A shortcut that carries an AUMID (for toast identity) is not offered yet
- `src/app/shell/native.test.ts` recycles a file, writes and reads a
  shortcut in a folder it creates under the temp directory and removes, and
  registers and removes an App Paths alias with a unique name

### Alarms (`winui-svelte/app/schedule`)

Starts the app at a time, once or on a repeat, through Task Scheduler, and
tells it which alarm went off
The shape is `chrome.alarms` (`create`, `get`, `getAll`, `clear`, `clearAll`,
`onAlarm`, the `Alarm` type) with promises instead of callbacks, and
`chrome.runtime.onStartup` for the start at sign-in
An opt-in subpath: an app that does not import it does not bundle it

```ts
import { ActivationKind, startActivation } from "winui-svelte/app/activation";
import * as alarms from "winui-svelte/app/schedule";

alarms.onAlarm.addListener(alarm => sync(alarm.name));
alarms.onStartup.addListener(() => restoreSession());
startActivation({ key: "my-app", onActivation: () => {} });

await alarms.create("nightly-sync", { when: Date.now() + 3_600_000, periodInMinutes: 1440 });
await alarms.get("nightly-sync"); // { name, scheduledTime, periodInMinutes: 1440 }
await alarms.getAll(); // every alarm this package made
await alarms.clear("nightly-sync"); // true
await alarms.clearAll(); // false
```

- `create(name, { when, delayInMinutes, periodInMinutes })` is Chrome's:
  `when` is milliseconds since 1970, `delayInMinutes` counts from now, and
  with only `periodInMinutes` the first run is one period away; `when` and
  `delayInMinutes` together, or none of the three, throw; creating a name again
  replaces its alarm
  - `name` is letters, digits, `.`, `_` and `-` (a task name, not free text)
  - Chrome's one-minute minimum for `delayInMinutes` is not applied: a delay
    can be seconds, and a time in the past runs at once
  - `periodInMinutes` is 1 to 44640 (Task Scheduler cannot repeat faster than
    a minute, nor slower than 31 days)
  - Extras, optional members of the same object: `arguments` (reach the
    started copy after the entry script), `runWhenOnBattery` (true by
    default), `command` (a bundled executable instead of Node) and `backend`
    (a test)
- `get`, `getAll`, `clear` and `clearAll` read and remove only the tasks in the
  `winui-svelte` folder of Task Scheduler, so a task of another program can
  neither be listed nor removed from here; `scheduledTime` is the next run
- `onAlarm` and `onStartup` have `addListener`, `removeListener` and
  `hasListener`; they are called by `startActivation`, so call it for the
  alarms to arrive
  - A task runs the app again with a marker argument, which becomes an `alarm`
    activation (`event.alarm`) and also reaches `onAlarm`; if the app is open,
    the new copy hands the activation to it and exits, so the listener of the
    running app hears it, and if it is closed, the started copy hears it
  - `onStartup` is called for a `startup` activation, that is when Windows
    starts the app at sign-in; turning that start on or off is `launchAtLogin`
    of `winui-svelte/app/activation` (the Run key listed in Settings, Apps,
    Startup), which this module does not repeat
- How it works: the package writes a Task Scheduler 1.2 XML definition to a
  private temporary file and runs `schtasks.exe /Create /XML` (found by
  `SystemRoot`), so no COM is involved; the task runs as the signed-in user
  with normal rights (no administrator), with no time limit, and a start
  missed while the PC was off is made up when it is next on; the alarm's first
  time and period are kept in the task's description, which is how `get`
  reads them back
- A one-shot alarm's task deletes itself a day after its time
- Limits:
  - The task runs only while the user is signed in
  - `schtasks` is the only gate: Group Policy can forbid task creation, and
    then `create` rejects with its message
  - Moving or reinstalling the app leaves a task that points at the old path
    until the alarm is created again
- `src/app/schedule/schedule.test.ts` checks the generated XML, the quoting
  and escaping of arguments, the marker argument and the activation it
  becomes, and an alarm's round trip to a task and back over a fake backend; no
  real task is made

### Global hotkeys (`winui-svelte/app/hotkeys`)

A system-wide key combination, heard whichever app has the focus
A web page cannot own a global key, so there is no web API to mirror; the
callback is told a `KeyboardEvent`-like object and the prop is the lowercase
`onpressed`
An opt-in subpath: an app that does not import it does not bundle it

```ts
import { registerHotkey } from "winui-svelte/app/hotkeys";

const hotkey = registerHotkey({
  keys: "ctrl+alt+k",
  onpressed: ({ keys }) => togglePalette(),
});
// later: hotkey.isRegistered, hotkey.unregister()
```

- `keys` is a string of modifiers and one key joined by `+`, in any case
  (`ctrl+alt+k`, `win+shift+f23`, `ctrl+5`, `f9`), or a typed object
  `{ modifiers: [HotkeyModifier.control], key: "k" }`
  Modifiers: `ctrl`/`control`, `alt`/`option`, `shift`, `win`/`windows`/`meta`/`super`
  Keys are named as `KeyboardEvent.code` names them, lowercase: letters,
  `digit0` to `digit9` (a bare `5` works in a string), `f1` to `f24`, `numpad0`
  to `numpad9`, `arrowleft`, `escape`, `space`, `minus`, `equal`,
  `bracketleft`, the media and volume keys
  `KeyCode` (in `winui-svelte/enums`, spelled as `KeyboardEvent.code` is) is the
  table every key name maps from to its virtual-key code, the same one the
  input events name keys with, and `HotkeyModifier` holds the modifiers
  A few aliases are accepted in a string (`esc`, `del`, `left`, `pgup`)
  A modifier named twice, no key, two keys or an unknown name throws
  `HotkeyParseError`
- `onpressed` runs on the UI thread with `{ keys, key, modifiers, ctrlKey,
  altKey, shiftKey, metaKey }`; holding the keys down presses once, because
  `MOD_NOREPEAT` is the default (`isRepeatAllowed: true` lifts it)
  An error thrown by the callback goes to `onUiError` and the hotkey stays
- Failures are typed and all extend `HotkeyError`: `HotkeyConflictError` when
  another app (or this one) owns the combination
  (`ERROR_HOTKEY_ALREADY_REGISTERED`), `HotkeyRefusedError` (with `code`) when
  Windows refuses it, `HotkeyParseError` for the string
- `unregister()` gives the combination back and may be called twice
  In a component, register in an `$effect` and return the unregister, so a
  closed window releases it; Windows frees the rest when the thread ends
- How it works: `RegisterHotKey` with no window posts `WM_HOTKEY` to the
  registering thread's queue, where no window procedure ever sees it
  The message pump (`createMessageSource`) offers each message it takes to a
  short list of hooks (`src/window/message-hooks.ts`) before the content and
  `DispatchMessage`, and the hotkey registry is one hook
  Any thread that runs the package's pump hears the hotkeys registered on it,
  a tray-only app with no window included; the registry and the hook list are
  one per thread
- Limits:
  - Nothing is heard while the pump is not running (before `runWindow` has
    started it, or after it stopped), and a callback waits for the message in
    front of it
  - Register on the thread whose pump runs, the UI thread
  - Windows reserves some combinations (`win+l`, `ctrl+alt+delete`, and others
    the shell owns): they throw `HotkeyRefusedError` or `HotkeyConflictError`
  - The first app to register a combination owns it; the only way to know is
    to try, and to ask the user for another when it throws
  - A key with no modifier (`f9`) is taken from every app
- `test/hotkeys.test.ts` registers `ctrl+alt+shift+f23` in a real window and
  posts `WM_HOTKEY` to the thread itself with `PostThreadMessageW`; no key is
  pressed

### System tray (`winui-svelte/tray`)

WinUI and the Windows App SDK have no notification-area API (apps call
`Shell_NotifyIconW`), so this opt-in entry point talks to the shell itself
An app that does not import it does not bundle it

```svelte
<script lang="ts">
  import { Window } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";
  import { hideToTray, toggleInTray, TrayIcon } from "winui-svelte/tray";

  let handle: WindowHandle | undefined = $state();
</script>

<Window onclosing={() => { if (handle) hideToTray(handle); return true; }} bind:handle>...</Window>
<TrayIcon
  icon={{ forLightTaskbar: "dark.ico", forDarkTaskbar: "light.ico" }}
  tooltip="My app"
  guid="6f1d3c52-8c1a-4a55-9d0e-7b2f4e9a1c03"
  onclick={() => handle && toggleInTray(handle)}
  oncontextmenu={({ x, y }) => openMenuAt({ x, y })}
/>
```

- `<TrayIcon>` props: `icon` (an `.ico` path, or `{ forLightTaskbar,
  forDarkTaskbar }`, swapped when the taskbar theme changes), `tooltip`,
  `isVisible` (default true), `guid`, `onclick`, `ondoubleclick`,
  `oncontextmenu`, `onmiddleclick`, and `bind:handle`
  The icon exists while
  the component does and is removed when it unmounts
- Each handler gets `{ gesture, x, y }`, the pointer in screen pixels: where to
  put a menu
  A double click is the second `onclick` and then `ondoubleclick`
- `createTrayIcon(options)` is the same without a component and returns the
  handle: `update({ icon, tooltip, isVisible })`, `notify({ title, body,
  icon, isSilent })` (a balloon), `bounds()` (where the shell drew the icon,
  from `Shell_NotifyIconGetRect`), `isRegistered`, `remove()`
  Call it on the
  UI thread
  `removeAllTrayIcons()` runs at process exit, so none stays as a
  ghost
- `guid` (a GUID of your own that never changes) is `NIF_GUID`: the shell keeps
  the icon's place and the user's "always show" choice
  It ties the GUID to the
  program's path, so a moved or unsigned build can lose it
  Without it the
  icon is identified by the hidden owner window and an id
- `hideToTray(handle)` hides a `WindowHandle`'s window and its taskbar button
  (`AppWindow.IsShownInSwitchers`), `restoreFromTray(handle)` undoes both and
  brings it to the front, `toggleInTray(handle)` picks by visibility
- The icon is registered again by itself when explorer restarts (no
  `TaskbarCreated` window message is heard; the icon is checked about once a
  second), is reloaded at the system DPI's small-icon size, and swaps on a
  light or dark taskbar

How clicks are heard, and what that cannot do: dynwinrt (0.1.0-preview.23)
binds Win32 functions to call, but offers no way to turn a JavaScript function
into a native function pointer (a window procedure, a hook, `SetWindowSubclass`):
in a probe, the table of a COM object it made ended after the three `IUnknown`
entries, and a COM thunk needs its own object as `this`
So the shell's callback message
(`NIF_MESSAGE`) cannot be received
That includes the keyboard ones: `NIN_KEYSELECT` and `NIN_SELECT` (Enter and
Space on a focused icon; `NOTIFYICON_VERSION_4` makes the shell send them) are
callback messages of the icon's window, delivered to its window procedure like
the mouse ones; reading them takes a procedure, and the polled substitutes do
not exist for a key (`GetAsyncKeyState` says a key is down, not that the shell
sent the icon an activation, and which icon has focus is not readable)
The tray polls instead: every 30 ms while the pointer is on the taskbar or
the overflow flyout (or a button is down), every 250 ms elsewhere, and not at
all while the icon is hidden, because a timer that wakes the thread 33 times a
second costs about 2 % of a core in an idle window
It reads `GetCursorPos`, `GetAsyncKeyState` and `Shell_NotifyIconGetRect`, and
a click is a press and a release both over the icon (a press between two slow
reads is still reported by the next one)
It reads input; it never sends any
What this means:

| Works | Cannot be heard |
|---|---|
| click, double click, middle click, right click with its position (the menu opens there) | keyboard activation (Enter or the context-menu key on a focused icon), touch and pen taps, `NIN_BALLOONUSERCLICK` / `NIN_BALLOONTIMEOUT` (so `notify` has no click event), `NIN_POPUPOPEN` hover cards |
| icon swap on theme and DPI, restart of explorer, update, hide | clicks on an icon the user has moved into the hidden overflow flyout while it is closed |

Menus: write the flyout in the `menu` snippet and a right click opens it at
the pointer

```svelte
<TrayIcon icon="app.ico" bind:menuAt>
  {#snippet menu({ close })}
    <MenuFlyout open onclosed={close}>
      <MenuFlyoutItem onclick={showWindow}>Show</MenuFlyoutItem>
      <MenuFlyoutItem onclick={quit}>Quit</MenuFlyoutItem>
    </MenuFlyout>
  {/snippet}
</TrayIcon>
```

A flyout needs an element in a live window, and a tray-only app has none, so
the component opens a one-pixel window for it: borderless, no taskbar button,
always on top, at the pointer moved inside the work area of the monitor under
it (a point on the taskbar lands on the work area's edge, and the flyout opens
away from it)
It is made on the first right click and closed with the menu: by
`close()`, by a choice, or by the user clicking away (the window losing the
foreground)
The window takes the foreground when it opens, which a plain
`SetForegroundWindow` is refused for a click the process only polled; the tray
joins the foreground thread's input state for the call (`AttachThreadInput`)
That sends no input
The menu follows the system's light or dark theme like any
window, and `menuAt` (`bind:menuAt`, a screen point or null) opens or closes
it from code
`shouldActivateMenu={false}` opens it without taking focus, for
tests
Any flyout or `CommandBarFlyout` works; the snippet's content is a
window's content

A Tauri or Electron host that already has a tray should keep it: two icons
would show, and this one lives and dies with the WinUI window's process

### One tray menu for every renderer (`winui-svelte/tray/menu`)

A pure model of a tray menu: no WinUI, no Win32, so it runs under
`node --test` and in a tray-only bundle
You declare items once; the user picks how much of the menu to see, from the
simple menu of a dictation app to the long one of a screenshot tool, and then
hides, shows and reorders single items; a renderer draws what `resolveMenu`
returns
An opt-in subpath: an app that does not import it does not bundle it

```ts
import { defineMenu, MenuItemKind, MenuLevel, resolveMenu } from "winui-svelte/tray/menu";

// The simple style: three commands and a separator, no levels set
const simple = defineMenu([
  { kind: MenuItemKind.COMMAND, id: "toggle", label: "Start dictation" },
  { kind: MenuItemKind.COMMAND, id: "settings", label: "Settings" },
  { kind: MenuItemKind.SEPARATOR, id: "line" },
  { kind: MenuItemKind.COMMAND, id: "quit", label: "Quit", isRequired: true }
]);

// The complex style: the same model with levels
const complex = defineMenu([
  { kind: MenuItemKind.HEADER, id: "capture-header", label: "Capture" },
  {
    kind: MenuItemKind.SUBMENU,
    id: "capture",
    label: "Capture",
    items: [
      { kind: MenuItemKind.COMMAND, id: "region", label: "Region", shortcut: "Ctrl+Shift+4" },
      { kind: MenuItemKind.COMMAND, id: "scroll", label: "Scrolling", level: MenuLevel.FULL }
    ]
  },
  {
    kind: MenuItemKind.SUBMENU,
    id: "recent",
    label: "Recent uploads",
    level: MenuLevel.STANDARD,
    emptyLabel: "Nothing uploaded yet",
    maxItems: 10,
    items: () => recentUploads().map(({ name }) => ({ kind: MenuItemKind.COMMAND, id: `recent-${name}`, label: name }))
  },
  {
    kind: MenuItemKind.CHECK,
    id: "autostart",
    label: "Start with Windows",
    level: MenuLevel.STANDARD,
    isChecked: () => isAutostart(),
    staysOpen: true
  },
  { kind: MenuItemKind.COMMAND, id: "quit", label: "Quit", isRequired: true }
]);

// Call it each time the menu opens: functions are read now
const lines = resolveMenu({
  items: complex,
  profile: { level: MenuLevel.STANDARD, hidden: ["region"], shown: [], order: {} }
});
```

- `MenuItem` is a union on `kind`: `command`, `check`, `radio`, `submenu`,
  `separator` and `header` (`MenuItemKind`); a field belongs to the kinds that
  have it, so a command with `isChecked` or a radio with no `group` fails to
  compile
- Every item has a unique, stable `id`; the profile of the user is keyed by it
  `defineMenu` keeps the ids as literal types, and `MenuProfile` typed with
  `MenuIds` of the menu (and the `profile` of `resolveMenu`) rejects an id
  that is not in the menu
- `level` is the lowest detail level that shows the item (`MenuLevel`:
  `simple`, `standard`, `full`; `simple` when left out); `isRequired` cannot
  be hidden by the user
- `label`, `isEnabled`, `isVisible`, `isChecked`, `isBold` and `badge` may be
  a value or a function, read each time `resolveMenu` runs
- `items` of a submenu may be a function that makes the children each time;
  `sort` and `maxItems` order and cap such a list, and `emptyLabel` shows a
  disabled line when it is empty instead of dropping the submenu
- `staysOpen` keeps the menu open after the pick (the renderer then refreshes
  labels and ticks only); `closeThenRun` (true unless set to false) runs
  `onselect` after the menu has closed, so that a dialog can open
- A submenu may have its own `onselect` and `autoExpand`
- `icon` is a path, a glyph or `IconPixels`; `shortcut` is display text only,
  the menu does not bind the key
- `MenuProfile` is plain JSON: `level`, `hidden` (ids the level shows that
  the user hid), `shown` (ids above the level that the user turned on) and
  `order` (child ids in the user order, keyed by parent id, `""` for the root)
- `resolveMenu({ items, profile })` returns `ResolvedMenuItem[]`: final text,
  booleans and a `select()` per line, with separators collapsed, headers with
  nothing under them dropped and empty submenus dropped; it throws
  `MenuModelError` for a repeated id or a radio with no group
- `describeMenu({ items })` lists every item with its id, kind, label, level,
  parent id and `isRequired`, for an editor
- `defaultProfile({ level })`, `parseProfile({ value })` and `profileSchema`
  (a field that is wrong falls back to its default, nothing throws),
  `loadProfile({ file })` and `saveProfile({ file, profile })` (the file is
  replaced atomically)
- Not in the model: the actions of the icon itself (left, double and middle
  click) stay on the tray icon options

### The tray menu in a window (`winui-svelte/tray/menu/svelte`)

The model of `winui-svelte/tray/menu` drawn by `<TrayIcon>` as a WinUI
`MenuFlyout`, from an array or from markup
An opt-in subpath; a consumer that imports only `winui-svelte/tray/menu`
bundles no Svelte and no component

```svelte
<script lang="ts">
  import { MenuLevel } from "winui-svelte/enums";
  import { TrayIcon } from "winui-svelte/tray";
  import { TrayMenu, TrayMenuItem, TrayMenuSeparator, TrayMenuSubmenu } from "winui-svelte/tray/menu/svelte";

  let isAutostart = $state(false);
  let recent = $state(["a.png", "b.png"]);
</script>

<TrayIcon icon="app.ico" tooltip="My app">
  <TrayMenu profile={savedProfile}>
    <TrayMenuItem id="open" label="Open" onselect={showWindow} />
    <TrayMenuItem id="autostart" kind="check" label="Start with Windows"
      isChecked={isAutostart} level={MenuLevel.STANDARD} staysOpen
      onselect={() => (isAutostart = !isAutostart)} />
    <TrayMenuSubmenu id="recent" label="Recent" emptyLabel="Nothing yet">
      {#each recent as name (name)}
        <TrayMenuItem id={`recent.${name}`} label={name} />
      {/each}
    </TrayMenuSubmenu>
    <TrayMenuSeparator id="line" />
    <TrayMenuItem id="quit" label="Quit" isRequired onselect={quit} />
  </TrayMenu>
</TrayIcon>
```

- `<TrayIcon menu={items} profile={profile}>` takes the array of
  `defineMenu` instead of markup, or the `menu` snippet of a hand-written
  flyout as before; the three never mix
  The ids of the array stay literal, so `profile` rejects an id the menu does
  not have
- `<TrayMenu>` and its children are inert elements: they draw nothing, the
  tray walks the tree each time the menu opens, so order, nesting, `{#if}`,
  keyed `{#each}` and reactive props all work, with no second renderer
- The props are the fields of the model's own items (`TrayMenuItem` takes a
  `kind` of `command`, `check` or `radio`; a tick on a command or a radio with
  no `group` fails `svelte-check`), and an unknown attribute fails too
- Markup cannot carry a literal union, so ids written in markup are plain
  `string`; the exported `collectMenu` reads a `TrayMenu` element into the same
  `MenuItem[]`
- A `TrayMenu` has a `profile` of its own, used for its lines
  `profile` on `TrayIcon` applies to `menu={items}`
- The flyout is built from `resolveMenu` each time the menu opens: a command is
  a `MenuFlyoutItem`, a check a `ToggleMenuFlyoutItem`, a radio a
  `RadioMenuFlyoutItem` (its `group` is the `GroupName`), a submenu a
  `MenuFlyoutSubItem`, a header a disabled bold item
  `isBold` is the font weight; `icon` is drawn as a glyph (`FontIcon`) or, for
  a path to an `.ico` or `.png`, an `ImageIcon`; `IconPixels` is not drawn
  A flyout has one trailing column, the keyboard accelerator's, so it shows
  the `badge` and then the `shortcut` as text
- `onselect` runs after the flyout has closed, on the next turn
  (`closeThenRun`, true unless set to false)
- `staysOpen`: WinUI closes a flyout when an item is invoked, and offers no
  property to keep it open, so the item runs after the close and the flyout is
  built again from the model, at the same point, with the new labels and ticks
  The menu blinks once; every other pick closes the menu
- `TrayMenuFlyout` (from `winui-svelte/tray`) is that flyout on its own: put
  it in a `menu` snippet with `resolve={() => resolveMenu({ items })}` and
  `onclose={close}`; `onflyout` hands over the native `MenuFlyout` to read
- Not drawn by WinUI: a submenu row's own `onselect` (a `MenuFlyoutSubItem` has
  no click) and `autoExpand` (it has no member to open it from code)

### Letting the user customize the tray menu (`winui-svelte/tray/menu/svelte`)

`<TrayMenuEditor>` is the settings control for a tray menu: the user picks how
much of it shows, from three lines to a ShareX-like menu "and everything in
between"
It edits a `MenuProfile` and says so; it never reads or writes a file

The three levels are the `level` of each item (`simple` when left out):

| Level | The user gets | Shown items |
|---|---|---|
| Simple | The few lines every user needs | Items of level `simple` |
| Standard | The usual set | `simple` and `standard` |
| Full | Everything the app can do | All |

```svelte
<script lang="ts">
  import { TrayIcon } from "winui-svelte/tray";
  import { loadProfile, saveProfile } from "winui-svelte/tray/menu";
  import { TrayMenuEditor } from "winui-svelte/tray/menu/svelte";
  import { items } from "./menu.ts";

  const FILE = "tray-menu.json";
  let profile = $state(loadProfile({ file: FILE }));
</script>

<TrayMenuEditor {items} isPreviewShown bind:profile
  onchange={next => saveProfile({ file: FILE, profile: next })} />

<TrayIcon icon="app.ico" menu={items} {profile} />
```

| Prop | Meaning |
|---|---|
| `items` | The menu `defineMenu` declares; the ids stay literal |
| `profile` | The user's choice, bindable; the default profile when left out |
| `onchange(profile)` | Runs with the new profile after every edit; save it here |
| `onsave(profile)` | Adds a Save button that runs this, for an app that saves on request |
| `labels` | The strings of the editor, each optional and English by default (`DEFAULT_EDITOR_LABELS`); `{name}` stands for an item's label |
| `isPreviewShown` | Lists the menu as it resolves under the profile, as plain rows |

- The detail level is three radio buttons: Simple, Standard, Full
  Changing it keeps the user's tweaks: an item the user hid stays hidden at
  every level, and one the user turned on above the level stays on
  The word "Custom" appears beside the level while the profile has any tweak
  (a hidden or shown item, or a menu in another order); the level alone is not
  a tweak
- Below it is a tree of every item (`describeMenu`), submenus with their
  children indented
  Each row has a check for "shown" (what the level, `hidden` and `shown` make
  of it), the lowest level that includes the item as text, and Up and Down
  buttons that move it within its own menu (the whole tree is reachable with
  Tab, Space and Enter, and no operation needs a drag)
- An item with `isRequired` is locked on and says "Always shown"
- "Reset to default" returns to `defaultProfile()` and is disabled while the
  profile already is that
- Every control has an `automationName`, the title and sections are headings,
  and no state is told by color alone
- The functions behind it are pure and tested without a window:
  `src/tray/menu-svelte/edit-profile.ts` (`setLevel`, `setItemShown`,
  `moveItem`, `editorRows`, `hasTweaks`)
- `examples/tray-menu-editor` puts the editor beside the tray icon it edits, on
  a ShareX-like menu with Capture, Upload and Tools submenus, a dynamic recent
  list, a check item and a required Exit; its simple level is a three-line menu

### Tray with no window (`winui-svelte/tray/standalone`)

A tray that runs in a process of its own, plain Node, with no `Window`, no
app, no WinUI and none of the component barrel: the notification-area icon
and its menu, and a click that starts or signals the full app
The panel then opens only when the user asks, and between clicks the tray
holds a fraction of the memory
`winui-svelte/tray` cannot do this: its `TrayIcon` mounts a WinUI window
for the menu and its timers run on the dispatcher queue

```ts
import {
  activateOrLaunch,
  createStandaloneTray,
  MenuItemKind
} from "winui-svelte/tray/standalone";

function openPanel() {
  void activateOrLaunch({
    key: "com.example.panel",
    activation: { arguments: ["--show"], workingDirectory: process.cwd() },
    launch: { command: "C:\\Program Files\\Panel\\panel.exe", arguments: ["--show"] }
  });
}

createStandaloneTray({
  icon: "tray.ico",
  tooltip: "Panel",
  onclick: openPanel,
  menu: [
    { kind: MenuItemKind.COMMAND, id: "open", label: "Open", onselect: openPanel },
    { kind: MenuItemKind.SEPARATOR, id: "line" },
    { kind: MenuItemKind.COMMAND, id: "quit", label: "Quit", onselect: () => process.exit(0) }
  ]
});
```

- `createStandaloneTray(options)` takes the icon's options (`icon`,
  `tooltip`, `isVisible`, `guid`, `onclick`, `ondoubleclick`,
  `onmiddleclick`), `menu`, `extras`, and `resolve` with `profile`, and returns
  a handle with `update`, `isRegistered` and `remove`, plus `notify` and
  `bounds` when their extras are passed
  The icon keeps the process alive; `remove()` or the process ending takes it
  out of the tray
- The default is the smallest tray: an icon from one `.ico` path, clicks,
  `update`, `remove` and the menu
  Three parts are opt-in, each one import from the same entry, passed in
  `extras`, and none of their code is in the bundle unless passed:
  `balloons` adds `notify`, `bounds` adds `bounds()`, and `themedIcon` lets
  `icon` be `{ forLightTaskbar, forDarkTaskbar }`, swapped as the taskbar theme
  changes
  The handle has `notify` or `bounds` only when its extra is passed, and a
  theme pair is accepted only with `themedIcon`; otherwise it fails to compile
  `createTrayIcon` and `TrayIcon` of `winui-svelte/tray` include all three

```ts
import { balloons, bounds, createStandaloneTray, themedIcon } from "winui-svelte/tray/standalone";

const tray = createStandaloneTray({
  icon: { forLightTaskbar: "dark.ico", forDarkTaskbar: "light.ico" },
  extras: [balloons, bounds, themedIcon]
});
tray.notify({ title: "Ready" });
```

- The menu is Windows' own popup menu (`TrackPopupMenuEx`), made on a right
  click and destroyed when it closes; nothing of it exists while idle
  `menu` is the same model as the windowed tray's (`winui-svelte/tray/menu`):
  commands, checks, radios, submenus to any depth, separators and headers,
  each with an `id` (a separator too), and values that are functions are read
  each time the menu opens, as are lazy submenu `items`
  The menu is drawn by the lite resolver by default: every item is shown in
  declared order, with dynamic values, `isVisible`, `emptyLabel`, `sort` and
  `maxItems` applied, and `level` and `isRequired` ignored; it leaves the
  level and profile code out of the bundle
  For levels, a user profile and ordering, opt in with one import:
  `resolve: resolveMenu` from the same entry, and then `profile`, the user's
  choice of level, hidden, shown and order (a `MenuProfile` with a
  `MenuLevel`, or a function that gives one, for example from
  `loadProfile`)
  The ids are literal types: `profile` accepts only ids of `menu`, and a
  wrong one fails to compile; a `profile` without `resolve: resolveMenu` also
  fails to compile, so a profile is never ignored in silence
  Windows draws a check as a tick, a radio as a dot, a header as a disabled
  bold line, a shortcut right-aligned and a badge after the label
  `staysOpen` closes and reopens the menu at the same point, with fresh
  labels and ticks, right after the line runs; `onselect` otherwise runs on
  the next turn after the menu is gone (`closeThenRun: false` runs it as the
  menu closes)
  A submenu's own `onselect` and `autoExpand`, and every `icon`, do nothing
  here: Windows opens a submenu row without reporting a pick, and no pixel
  or file icon is drawn
  The menu is modal: the thread runs its own message loop until it closes
  It does not follow a dark system theme, which a native popup menu does not
  without an undocumented call; a menu that must match the theme belongs in
  `winui-svelte/tray` with `TrayIcon`'s `menu` snippet
- The same entry re-exports `activateInstance`, `activateOrLaunch` and
  `launchApp` from `winui-svelte/app` (App lifecycle), so a tray imports from
  one place; the app side calls `ensureSingleInstance` with the same `key`
- The clicks are heard the way `winui-svelte/tray` hears them, by polling
  the pointer on the process's timer (Node's `setInterval`)
- A test bundles it (`scripts/pack/tray-only.test.ts`) and fails if any
  component, window or renderer module, or a component's name, is in the
  output, or if it grows past its budget

### Tray as an entrypoint (`entrypoints/tray.ts`)

The app does not have to know it has a tray; the tray is its own file, found
by its name and built into a small bundle for a process of its own

```text
my-app/
  entrypoints/
    main.ts      -> dist/main.js
    window.ts    -> dist/window.js
    tray.ts      -> dist/tray.js, dist/tray.json, dist/tray.ico
```

`main.ts` and `window.ts` never import `tray.ts`; `buildApp` (and the dev
server of `winuiSvelte()`) discover the folder, so `entries` is optional, and a
name given in `entries` wins over the file found

```ts
import { activateOrLaunch, defineTray, MenuItemKind, MenuLevel, resolveMenu } from "winui-svelte/tray/standalone";

export default defineTray({
  icon: "tray.ico",
  tooltip: "My app",
  guid: "7d1c5a52-3f1b-4a63-9f5e-2f4d6b0c8a11",
  onactivate: openApp,
  resolve: resolveMenu,
  menu: [
    { kind: MenuItemKind.COMMAND, id: "open", label: "Open", isRequired: true, onselect: openApp },
    { kind: MenuItemKind.COMMAND, id: "capture", label: "Capture", level: MenuLevel.STANDARD }
  ]
});
```

- `defineTray` returns its argument; it takes the options of
  `createStandaloneTray` (`menu`, `resolve`, `profile`, `extras`, the click
  handlers) with the ids of `menu` as a literal union, so a `profile` that names
  an id the menu lacks is a type error, and `profile` needs `resolve`
- `guid` is required: it keeps the icon's place in the tray and names the one
  tray process, so a second `tray.js` exits at once
- `onactivate` runs on a left click when `onclick` is not given
- The build reads `icon`, `tooltip` and `guid` from the syntax tree, never by
  running the file, so a top-level import of WinRT in `tray.ts` does not
  execute at build; `icon` and `guid` must be string literals, and the icon a
  file inside the folder of `tray.ts` (written there as `icon: "tray.ico"`,
  copied to the same relative path in the output)
- `tray.js` is the wrapper the build writes (a virtual module, like WXT's
  background): it imports the default export, calls `claimTrayInstance({ guid })`
  (the right to be the one tray for the `guid`; false in a second copy) and then
  `createStandaloneTray`; `tray.json` holds what was read
- `startTray()` from `winui-svelte/app` starts `tray.js` detached once; it is
  optional, for an installer, a launcher or the app's own start; it reads
  `tray.json` for the `guid`, so the key is derived in one place
  (`trayInstanceKey(guid)`); `activateOrLaunch` is how the tray reaches the app
- Under the dev server the tray is built into `.winui/tray` and started; a
  change to it rebuilds and restarts the process (no HMR, as WXT's background)
  after stopping the Node process whose pid `.winui/tray.pid` holds
- The icon of a stopped process stays in the notification area until the
  pointer passes over it; that is how Windows handles an icon whose process
  was ended
- The bundle holds no component and no window runtime; most of its size is
  zod, which a bundle for Node carries (`scripts/pack/tray-entrypoint.test.ts`
  keeps its budget)
- `tray.svelte` is the same entrypoint written as markup (next section); a
  folder with both `tray.ts` and `tray.svelte` is an error

The working example is `examples/tray-entrypoint`

#### The tray written as markup (`entrypoints/tray.svelte`)

The menu can be written with the components of
`winui-svelte/tray/menu/svelte`; the build reads the file with Svelte's parser
and lowers the markup to the plain model of `tray.ts`, so none of Svelte's
runtime is in `tray.js` (about 40 KB that a tray-only process cannot carry)

```svelte
<script module lang="ts">
  import { activateOrLaunch, resolveMenu } from "winui-svelte/tray/standalone";

  let isAutostart = false;

  function openApp() {
    void activateOrLaunch({ key: "my-app", activation: { arguments: [], workingDirectory: "." }, launch: { command: process.execPath, arguments: ["main.js"] } });
  }

  function recentCaptures() {
    return ["a.png", "b.png"];
  }

  export const options = {
    icon: "tray.ico",
    tooltip: "My app",
    guid: "7d1c5a52-3f1b-4a63-9f5e-2f4d6b0c8a11",
    onactivate: openApp,
    resolve: resolveMenu
  };
</script>

<script lang="ts">
  import { TrayMenu, TrayMenuItem, TrayMenuSubmenu } from "winui-svelte/tray/menu/svelte";
</script>

<TrayMenu>
  <TrayMenuItem id="open" label="Open" isRequired onselect={openApp} />
  <TrayMenuSubmenu id="recent" label="Recent" emptyLabel="Nothing yet">
    {#each recentCaptures() as name, iCapture (name)}
      <TrayMenuItem id={`recent.${iCapture}`} label={name} />
    {/each}
  </TrayMenuSubmenu>
  {#if isAutostart}
    <TrayMenuItem id="delay" label="Delay at sign-in" />
  {/if}
</TrayMenu>
```

- `<script module>` holds `export const options = { ... }`, the options of
  `defineTray` except `menu` (the markup is the menu); the build reads `icon`,
  `tooltip` and `guid` from its literals as it does for `tray.ts`, and
  everything `options` uses (functions, imports) lives in the same script,
  because Svelte keeps a module script apart from the instance script; a
  `satisfies` on the object is read through
- The menu is read each time it opens, like the dynamic values of the model, so
  a plain `let` and a plain function are always current; there is no `$state`,
  `$derived`, `$effect`, `$props`, `$bindable`, `$inspect` or `$host` (the build
  refuses them, since nothing would re-run)
- Supported: `TrayMenu` (once, the root, no attributes), `TrayMenuItem` (a
  command, or `kind="check"` or `kind="radio"`), `TrayMenuSubmenu`,
  `TrayMenuSeparator` and `TrayMenuHeader`, imported by name; attributes as
  `label="text"`, `label="x {y}"`, `label={expression}`, `{shorthand}`, a bare
  boolean (`isRequired`), `{...spread}` and `onselect={handler}`; `{#if}`,
  `{:else if}` and `{:else}`; `{#each list as item, index (key)}` over an array
  (the key is not used, the `id` is the identity); `{@const}`; the children of
  a submenu become its `items` function
- Refused with an error that names the file, the line and the construct:
  components of your own, other elements, `{#await}`, `{#key}`, `{#snippet}`,
  `{@render}`, `{@html}`, `{@debug}`, `bind:`, `use:`, `on:`, `class:`,
  `style:`, `let:`, transitions, `animate:`, `{@attach}`, `<svelte:*>`, text
  between the lines, `{:else}` of an `{#each}` (give the submenu an
  `emptyLabel`), a `<style>` block and importing a `.svelte` file
- Each line becomes an object literal and `menu` the function that returns
  them: `{#if}` spreads a conditional array, `{#each}` spreads `flatMap`, so
  `defineTray` receives `menu: () => [ ... ]` (a function is accepted wherever
  an array is, by `createStandaloneTray` too)
- `svelte-check` and the editor check the markup against the props of the
  components, so a wrong attribute or value is an error there; the build
  checks nothing, as for any `.svelte` file
- A `tray.svelte` built to `tray.js` is within a few dozen bytes of the same
  tray written in `tray.ts` (`scripts/pack/tray-svelte-entrypoint.test.ts`)

The working example is `examples/tray-entrypoint-svelte`

### Notice with no app (`winui-svelte/notice`)

`showNotice` shows a message box before there is a window or an app: the
checks that end a run before it starts (the Windows 11 gate, a revoked
licence) can tell the user why

```ts
import { NoticeButton, NoticeButtons, NoticeIcon, showNotice } from "winui-svelte/notice";

await showNotice({
  title: "My app",
  message: "This app needs Windows 11",
  icon: NoticeIcon.ERROR
});
const pressed = await showNotice({
  title: "Update",
  message: "Install now?",
  icon: NoticeIcon.QUESTION,
  buttons: NoticeButtons.YES_NO
});
const isConfirmed = pressed === NoticeButton.YES;
```

- `showNotice({ title, message, icon, buttons, owner })` resolves with the
  `NoticeButton` pressed: `ok`, `cancel`, `yes`, `no`, `retry`, `abort` or
  `ignore`
  `icon` is a `NoticeIcon` (`none`, `information`, `warning`, `error`,
  `question`), `buttons` a `NoticeButtons` (`ok`, `okCancel`, `yesNo`,
  `yesNoCancel`, `retryCancel`, `abortRetryIgnore`)
- It is `MessageBoxW` and nothing else: no WinUI, no `runWindow`, no
  `initWindowsAppSdk`, so plain Node can call it first thing
  Without an `owner` the box stays on top and takes the foreground;
  `owner` is a window handle to center on and block
- It is not a TaskDialog: `TaskDialogIndirect` needs Common Controls 6, which
  `node.exe` has no manifest for, so custom button text, links and progress
  bars are not here
- The dialog is modal and runs its own message loop, so the calling thread
  waits for it
  It throws when Windows could not show the box
  A box cannot be dismissed from a test without input, so the tests fake the
  call; the one real call they make passes a window handle that does not
  exist, which Windows refuses at once without showing anything
### Taskbar button (`winui-svelte/window/taskbar`)

`handle.taskbar` is the window's button on the taskbar: a progress bar, an
overlay icon, flashing and the thumbnail's tooltip and clip, over
`ITaskbarList3` and `FlashWindowEx`
No package identity is needed; call it on the UI thread
The shell calls need the real desktop shell, so a window on a desktop of its
own gets `E_NOTIMPL`; a window that has no taskbar button (a background or
tray window) accepts the calls and shows nothing

```ts
import { TaskbarProgressState } from "winui-svelte/window/taskbar";

handle.taskbar.setProgress({ state: TaskbarProgressState.NORMAL, value: 0.4 });
handle.taskbar.setOverlayBadge({ count: 3 });
handle.taskbar.flash({ count: 2 });
```

- `setProgress({ state, value })`: `state` is a `TaskbarProgressState`
  (`none`, `indeterminate`, `normal`, `error`, `paused`); `value` is 0 to 1,
  clamped, and ignored for `none` and `indeterminate`; a value that is not a
  number is a `TypeError`
- `setOverlayIcon({ icon, description })`: `icon` is the path of an .ico file
  or `null` to remove it; `description` is what a screen reader says
- `setOverlayBadge({ count })` or `setOverlayBadge({ glyph })`: draws the badge
  as pixels (a disc with the digits, or the `BadgeGlyph`'s colour and mark) at
  the system's small icon size; `clearOverlay()` takes any overlay away
- `flash({ count, until })`: `until` is a `TaskbarFlashUntil` (`count`, the
  default, flashes `count` times, 3 by default; `foreground` until the window is
  brought forward; `stopped` until `stopFlashing()`)
- `setThumbnailTooltip(text)`: the text above the window's thumbnail on hover
  (259 characters at most, else a `RangeError`; empty shows the title again)
- `setThumbnailClip({ x, y, width, height })`: shows only that part of the
  window in the thumbnail, in pixels of the client area, inside it; `null`
  shows all of it; whole numbers with a positive size, else a `TypeError`
  `SetThumbnailClip` gets `E_NOTIMPL` on a desktop of its own, so only a fake
  tests it
- Thumbnail toolbar buttons are not offered: their click is a sent message
  that Node cannot receive; use jump list tasks (`winui-svelte/app/jump-list`)
- `createTaskbarButton(hwnd)` and `TaskbarButton` take a window handle
  (`appWindow.id.value`) directly; `taskbarBadgeBackend(button)` is the
  `fallback` for `installBadging`
- `examples/taskbar`: a download bar mirrored on the button and an unread count
- `ITaskbarList3` has no WinRT form, so its methods are declared by hand at
  their vtable slots over dynwinrt's `DynComUnsafe`, as the share interop is
- The shell offers no way to read a bar or an overlay back, so the window test
  (`test/taskbar.test.ts`, on the default desktop with an off-screen window)
  checks that every call returns `S_OK`

### Localization: what works unpackaged

- **`Intl` and your own string tables work everywhere.**
  `new Intl.DateTimeFormat().resolvedOptions().locale` is the user's locale
  and needs nothing from Windows; a table keyed by language is the portable
  way to translate an app hosted from `node.exe`
- **WinUI's `ResourceLoader` (`.resw` / `resources.pri`) is not wired up, and
  by default will not find your strings.** An unpackaged app's default
  resource file is `resources.pri` next to the running `.exe` (Microsoft's
  documentation, for apps without package identity: build it with `makepri`
  without a packaging section and copy it beside the program)
  Hosted from
  Node, that program is `node.exe`, in Node's folder, not yours
  Its bindings
  have a constructor that takes a `.pri` path (`new ResourceLoader(fileName)`),
  which would sidestep this; it is not exercised by any test here, so treat it
  as untried
  Without package identity the loader also follows the system
  display language, not the user's preferred-language list
- **XAML's `x:Uid` does not apply**: components are Svelte, not XAML
- **Package identity** (an MSIX, or a sparse package) is what unlocks the
  rest of Windows' app model: the per-package resource lookup above, toast
  notifications that survive the app closing
  Nothing in this section needs it

### Planned, not in the package yet

- A `ResourceLoader` wrapper that finds a `.pri` beside the app

The working example is `examples/services` (`test/services.test.ts` runs it in
a real window; the dialogs themselves need a person and are not opened there)

## ChromePermissions (`winui-svelte/chrome/permissions`)

`chrome.permissions` for a native app, with Chrome's names and shapes:
`getAll()`, `contains(permissions)`, `request(permissions)`,
`remove(permissions)`, `onAdded` and `onRemoved` (a `ChromeEvent`), and
`Permissions { permissions, origins }`
Opt-in: nothing is bundled until an app imports it, importing does no work,
and no global is installed

```ts
import { ChromePermissions } from "winui-svelte/chrome/permissions";

const permissions = new ChromePermissions();
permissions.onAdded.addListener(({ permissions: names }) => console.log(names));
const isAllowed = await permissions.request({
  permissions: ["geolocation"],
  openSettings: true
});
```

There is no per-site prompt in a native app; a permission is the OS consent
the Permissions API already reports (`registerPermission` providers, so the
Web APIs stay the single source of truth)
The app holds a native permission when it asked for it and Windows allows it
now; if either side takes it back, `contains` turns false
The names the app asked for are saved in `chrome-permissions.json` in the
app's data folder (`appDataFolder`, the folder `localStorage` uses), kept
by an atomic write

| Chrome name | Held when | Backed by |
| --- | --- | --- |
| `audioCapture` | allowed | `microphone` |
| `videoCapture` | allowed | `camera` |
| `geolocation` | allowed | `geolocation` |
| `notifications` | allowed | `notifications` |
| `clipboardRead`, `clipboardWrite` | allowed | `clipboard-read`, `clipboard-write` |
| `idle` | allowed | `idle-detection` |
| `bluetooth` | allowed | `bluetooth` |
| `gcm` | allowed | `push` |
| `power` | allowed | `screen-wake-lock` |
| `unlimitedStorage` | allowed | `persistent-storage` |
| `activeTab`, `alarms`, `background`, `contextMenus`, `cookies`, `declarativeNetRequest`, `downloads`, `offscreen`, `scripting`, `storage`, `tabs`, `webRequest`, `windows` | always | nothing; no native meaning, and `remove` answers false |
| any other name | never | `contains` and `request` reject with an `Error` |
| origins (`<all_urls>` and match patterns) | always | nothing; a native app has no host permissions, a bad pattern rejects, `remove` answers false |

- The table is data you can read: `NATIVE_PERMISSIONS` (a `Map` from a Chrome
  name to the Web permissions behind it), `GRANTED_BY_DEFAULT` (a `Set` of the
  always-held names) and `ALL_URLS` (`<all_urls>`)
- `request` checks each missing native permission: a state of `prompt` calls
  the provider's `request` (location shows the Windows prompt through
  `Geolocator.RequestAccessAsync`); camera and microphone are asked by the
  first device open, so they stay refused until Windows allows them
- All requested permissions must be allowed, or `request` answers false and
  saves nothing; `onAdded` fires with the new ones
- WinUI-only extra: `openSettings: true` in the object of `request` opens the
  Settings page with the switch (`ms-settings:privacy-webcam`,
  `privacy-microphone`, `privacy-location`, `notifications`, `bluetooth`,
  else `privacy`) when a permission stays refused; the answer is still false
- `remove` forgets the saved grant and fires `onRemoved`; Windows keeps its own
  switch
- Options of the constructor: `file`, `appName`, `location`, `environment`
  and `openSettings`, the stand-ins for tests

## ChromeContextMenus (`winui-svelte/chrome/context-menus`)

`chrome.contextMenus` for a native app, with Chrome's names and shapes:
`create(properties)` (answers the id), `update(id, properties)`,
`remove(id)`, `removeAll()` and `onClicked` (a `ChromeEvent`); the item
types `normal`, `checkbox`, `radio` and `separator`, and `title`, `id`,
`checked`, `enabled`, `visible`, `contexts`, `parentId` and `onclick`
Opt-in: nothing is bundled until an app imports it, importing does no work,
and no global is installed

The items live in one list and are drawn by the tray menu model
(`winui-svelte/tray/menu`), not by a second menu implementation:
`menu(surface)` answers the lines for `TrayIcon` (`menu={...}`) or for a
window's context flyout, in the same `MenuItem` shape
The array is the same object each time and is rewritten in place when an item
changes, so a menu that reads it when it opens shows the current items

```ts
import { ChromeContextMenus, ContextMenuSurface } from "winui-svelte/chrome/context-menus";

const menus = new ChromeContextMenus();
menus.create({ id: "pause", title: "Pause", type: "checkbox", contexts: ["action"] });
menus.onClicked.addListener(({ menuItemId, checked }) => console.log(menuItemId, checked));
const lines = menus.menu(ContextMenuSurface.TRAY);
```

| Context | Surface | Shown |
| --- | --- | --- |
| `action`, `browser_action`, `page_action` | `tray` | in the tray icon's menu |
| `page` | `window` | in the context flyout of a window |
| `all` | both | in both |
| `frame`, `selection`, `link`, `editable`, `image`, `video`, `audio`, `launcher` | none | accepted and ignored; there is no page under a native menu |

- `contexts` is `["page"]` when left out, as in Chrome
- `documentUrlPatterns` and `targetUrlPatterns` are accepted and ignored
- A radio belongs to the run of radios next to it among its siblings; a pick
  ticks it and unticks the others of the run
- A pick of a checkbox flips it; `onclick` runs first, then `onClicked`
  fires with `menuItemId`, `parentMenuItemId`, `checked`, `wasChecked` and
  `editable` (always false); there is no `pageUrl`, `selectionText` or tab
- An item with children is drawn as a submenu; a hidden item leaves out its
  children
- `create` throws, and `update` and `remove` reject, with an `Error` for a
  duplicate id, an unknown id or parent, a parent under the item, a missing
  title, or a key Chrome does not know
- Not mirrored: the callback arguments (use the promises), Chrome's grouping of
  several top-level items under the extension's name, and the limit of six
  top-level `action` items
- Public exports: `ChromeContextMenus`, `ContextItemType`,
  `ContextMenuSurface`, `ContextType`, `ChromeEvent`, and the types
  `CreateProperties`, `OnClickData` and `UpdateProperties`

## Downloads (`winui-svelte/downloads`)

Downloads on the two APIs an app already knows: the web's `fetch` with the File
System Access API, and `chrome.downloads`
Opt-in: nothing is bundled until an app imports it, and importing does no work

### Web layer: `fetchToFile`

`fetchToFile` streams a URL into the file handle `showSaveFilePicker` gave
(`installFileSystem` defines it), resumes with a Range request and marks the
finished file as downloaded from the Internet

```ts
import { fetchToFile } from "winui-svelte/downloads";

const handle = await showSaveFilePicker({ suggestedName: "setup.exe" });
await fetchToFile({
  url: "https://example.com/setup.exe",
  handle,
  onprogress: ({ loaded, total }) => console.log(loaded, total)
});
```

- The body goes through `FileSystemWritableFileStream`; when it is whole the
  file gets a `Zone.Identifier` alternate data stream with `ZoneId=3` and
  `HostUrl` (the final address, without credentials), as a browser's download
  would, so Explorer and SmartScreen warn before it runs; a volume with no
  streams (FAT, a share) stays unmarked
- A failed or cancelled (`signal`) read keeps the bytes that arrived;
  `resume: true` sends `Range: bytes=<size of the file>-` and appends to it
  when the server answers 206 with the matching `Content-Range`; a server that
  ignores the range (200) or refuses it (416) makes the download start over
- `onprogress({ loaded, total })` runs after every chunk; `total` is undefined
  when the server sends no length or compresses the body
- A non-2xx answer throws `DownloadError` with the `status`; `headers`,
  `method` and `body` shape the request and `fetch` stands in for the global
  one (the tests do)
- `requestDownload` and `streamToFile` are the two halves of `fetchToFile`, for
  an app that decides the file after the headers arrive;
  `markOfTheWeb({ path, hostUrl })` marks a file saved another way and
  `zoneIdentifierText(hostUrl)` is the stream's text

### Chrome layer: `Downloads`

`Downloads` is `chrome.downloads` with the same names and shapes; where Chrome
takes a callback, a method returns a promise

```ts
import { Downloads } from "winui-svelte/downloads";

const downloads = new Downloads();
downloads.onChanged.addListener(({ id, state }) => {
  if (state?.current === "complete") {
    console.log(`download ${id} is done`);
  }
});
const id = await downloads.download({
  url: "https://example.com/setup.exe",
  filename: "installers/setup.exe",
  conflictAction: "uniquify",
  taskbar: handle.taskbar
});
await downloads.pause(id);
await downloads.resume(id);
const [item] = await downloads.search({ id });
```

- `download({ url, filename, saveAs, conflictAction, headers, method, body })`
  returns the id once the download has started; the options are checked with
  zod, so a bad `url`, `method` or an unknown key rejects; `filename` is
  relative to the downloads folder (`directory` of the constructor, the user's
  Downloads folder by default) and may not leave it
- The file name is `filename`, else the server's `Content-Disposition`, else
  the last part of the address; `conflictAction` is `uniquify` (the default,
  `name (1).ext`), `overwrite` or `prompt`; `saveAs` and `prompt` ask with the
  global `showSaveFilePicker` (or `pickSaveFile` of the constructor)
- The bytes arrive in the file's name plus `.part`, renamed when whole, with
  the Mark of the Web
- `pause(id)` keeps the bytes (`paused: true`, `canResume: true`) and
  `resume(id)` asks for the rest with a Range request; a dropped connection
  ends `interrupted` with `NETWORK_FAILED` and can resume too; `cancel(id)`
  deletes the bytes and ends `interrupted` with `USER_CANCELED`
- `search(query)` takes Chrome's `DownloadQuery` (`query` terms, with a leading
  `-` to exclude, `filenameRegex`, `urlRegex`, `startedBefore` and the other
  time bounds, `totalBytesGreater`, `limit`, `orderBy` and every field as an
  exact match); `erase(query)` removes the ones that are not running from the
  list and returns their ids, the files stay; `removeFile(id)` deletes the file
- `show(id)` and `showDefaultFolder()` open Explorer through `revealInExplorer`
- `onCreated` gets the `DownloadItem`, `onChanged` a `DownloadDelta` with only
  what changed (`state`, `paused`, `bytesReceived`, `totalBytes`, `error`,
  `canResume`, `filename`, and so on) and `onErased` the id; they have
  `addListener`, `removeListener`, `hasListener` and `hasListeners`
- The closed sets are `DownloadState` (`in_progress`, `interrupted`,
  `complete`), `FilenameConflictAction`, `HttpMethod` and `InterruptReason`,
  and `ChromeEvent` is the class of the three events
- `DownloadItem.totalBytes` and `fileSize` are -1 while unknown, as in Chrome;
  the `error` values are `InterruptReason`'s, and an HTTP status maps to
  `SERVER_UNAUTHORIZED`, `SERVER_FORBIDDEN`, `SERVER_BAD_CONTENT` or
  `SERVER_FAILED`
- `taskbar` is the one extra member of the options object: `handle.taskbar`
  shows a bar that fills as the download goes (a marquee when the size is
  unknown), yellow while paused, removed when it ends and red when it fails
- Not mirrored: `open`, `getFileIcon`, `acceptDanger`, `setShelfEnabled`,
  `onDeterminingFilename` and the danger types, a download here is always safe
- `src/downloads/fetch-to-file.test.ts` and `chrome-downloads.test.ts` run
  against a local HTTP server with Range support

## Chrome storage (`winui-svelte/chrome/storage`)

`chrome.storage` with the same areas, names and shapes; where Chrome takes a
callback, a method returns a promise
Opt-in: nothing is bundled until an app imports it, and importing does no work

```ts
import { ChromeStorage } from "winui-svelte/chrome/storage";

const storage = new ChromeStorage();
storage.onChanged.addListener((changes, areaName) => {
  console.log(areaName, changes);
});
await storage.local.set({ theme: "dark", volume: 0.8 });
const { theme } = await storage.local.get({ theme: "light" });
await storage.session.set({ token: "abc" });
await storage.local.remove(["volume"]);
const bytes = await storage.local.getBytesInUse();
```

- Areas: `local`, `sync`, `session` and `managed`, each a `StorageArea` with
  `get`, `getKeys`, `getBytesInUse`, `set`, `remove`, `clear`,
  `setAccessLevel` and `onChanged`; `ChromeStorage.onChanged` fires for every
  area with `(changes, areaName)`
- `get(keys)` takes a key, an array of keys, an object of defaults, or null or
  nothing for every item; arguments are checked with zod and a wrong one
  rejects
- Values are JSON, as in Chrome: a value JSON cannot hold (a function,
  `undefined`) is left out, `NaN` becomes `null` and a `Date` becomes its
  string; the stored files are checked with zod and a corrupt one reads as
  empty
- `local` is a JSON file in the app's local data folder, next to
  `localStorage` (`chrome-storage-local.json`, written atomically after every
  change); `session` is in memory and ends with the process; the file is read
  on the first call to the area
- `sync` is a local fallback: Windows has no sync service an unpackaged app
  can use (roaming settings are deprecated), so `chrome-storage-sync.json`
  lives beside the local file and values never reach another PC; Chrome's
  `sync` limits apply (`QUOTA_BYTES` 102400, `QUOTA_BYTES_PER_ITEM` 8192,
  `MAX_ITEMS` 512) so code meets the same errors; the write-rate constants are
  published and not enforced
- `managed` is read-only and always empty: `set`, `remove` and `clear` reject
  with `This is a read-only store.`, and `get` answers the defaults
- `QUOTA_BYTES` is 10485760 for `local` and `session`, and a write that would
  pass a quota rejects and stores nothing; `getBytesInUse` counts each key's
  length plus its JSON text, as Chrome does
- `onChanged` gets `{ key: { oldValue, newValue } }` only for keys that
  changed (`oldValue` is missing for a new key, `newValue` for a removed one);
  a write that changes nothing fires nothing
- `setAccessLevel({ accessLevel })` takes `AccessLevel`'s values and keeps
  them; every context of a native app is trusted, so it changes nothing
- A change made by another process is not seen, and `ChromeStorage` takes
  `appName`, `environment`, `localFile` and `syncFile` (the tests give an
  in-memory file); the closed sets are `StorageAreaName` and `AccessLevel`
- `LOCAL_QUOTA`, `SESSION_QUOTA` and `SYNC_QUOTA` hold the numbers each area
  publishes, for code that wants them without making a `ChromeStorage`
- `src/chrome/storage/chrome-storage.test.ts` runs against an in-memory file

## Chrome runtime (`winui-svelte/chrome/runtime`)

`chrome.runtime` for a native app: the manifest, messages and ports between the
app's own contexts, native messaging hosts, and the install and exit events
Opt-in: nothing is bundled until an app imports it, importing does no work, and
no global `chrome` is installed; make one `Runtime` in each context that wants
one

```ts
import { Runtime } from "winui-svelte/chrome/runtime";

const runtime = new Runtime();
runtime.addLink(transport);
runtime.onMessage.addListener((message, sender, sendResponse) => {
  sendResponse({ echo: message });
});
const answer = await runtime.sendMessage({ hello: "world" });
```

- Where Chrome sets `chrome.runtime.lastError`, a promise rejects or a `Port`
  has an `error`; there is no `lastError`
- `getManifest()` gives `{ manifest_version: 3, name, version, description }`
  from the package identity when the app has one, else from the nearest
  `package.json` above the entry script; `id` is the package family name, or
  the `package.json` name; `getURL(path)` is `ms-appx:///path` in a package and
  a `file:` URL under the folder of `package.json` otherwise;
  `getPlatformInfo()` is `{ os: "win", arch }` with Chrome's architecture names
- Contexts are joined by `addLink(transport)`, with any transport of
  `winui-svelte/state` (a worker's message port, stdio, memory); the call
  returns how to leave; messages are `defineMessaging` requests, so framing,
  timeouts (`timeoutMilliseconds`) and a closed link are the messaging layer's
  own, and every frame is checked with zod
- `sendMessage(message)` reaches every other linked context and resolves with
  the first answer; a listener answers with `sendResponse`, by returning `true`
  and calling it later, or by returning a promise; it resolves `undefined` when
  listeners heard it and none answered, and rejects with Chrome's own "Receiving end does not exist" error when no
  context is linked or none listens; a listener that throws or rejects rejects the sender
- `connect({ name })` opens a `Port` to every other linked context, which hears
  it in `onConnect`; `Port` has `postMessage`, `onMessage`, `onDisconnect`,
  `disconnect()`, `name` and `sender`; a port ends when the link closes, and
  `error` says why when something failed
- `connectNative(application)` and `sendNativeMessage({ application, message })`
  start a registered host and speak the native messaging protocol on its stdio
  (four bytes of length, then JSON; a host's message is limited to 1 MiB)
- A host is registered as in Chrome: a key
  `Software\winui-svelte\NativeMessagingHosts\<name>` below
  `HKEY_CURRENT_USER` whose default value is the path of the manifest (`name`,
  `path`, `type: "stdio"`, `allowed_origins`); the host gets the app's origin,
  `winui-svelte://<id>/`, as its first argument, and an `allowed_origins` that
  omits it refuses the host; a host is an executable, not a script;
  `resolveHost`, `registry` and `spawnHost` stand in for the lookup and the
  start in a test
- `onInstalled` fires from `detectInstalled()`, which an app calls once at
  start: `{ reason: "install" }` on a first run, `{ reason: "update",
  previousVersion }` when the version changed, nothing when it is the same; the
  last version is kept in `%LOCALAPPDATA%\winui-svelte\runtime\<id>.json`, or
  in the `versionStore` you give
- `onStartup` is the `onStartup` of `winui-svelte/app/schedule`, fired by
  `startActivation` for a `startup` activation (see `launchAtLogin`), not a
  second source
- `onSuspend` fires when the process exits, the only suspend a desktop app
  has; `suspendSource` changes what it listens to; `dispose()` stops it and
  closes the links
- `reload()` is `relaunch` of `winui-svelte/app`
- The protocol's pieces are exported for a host written in Node:
  `encodeNativeMessage(message)`, `NativeMessageDecoder` (`push(chunk)` returns
  the messages a chunk completed), `NativeMessageError`, `MAX_HOST_MESSAGE_BYTES`
  and `NATIVE_HOST_REGISTRY_KEY`, the registry key below `HKEY_CURRENT_USER`
  that holds the hosts
- Not mirrored: `onMessageExternal`, `onConnectExternal`, `onSuspendCanceled`,
  `onUpdateAvailable`, `requestUpdateCheck`, `restart`, `setUninstallURL`,
  `openOptionsPage`, `getContexts`, `getPackageDirectoryEntry`
- The single-instance pipe stays the way a second copy of the app reaches the
  first (`startActivation`); contexts of one copy talk over their transports
- `src/chrome/runtime/runtime.test.ts` runs it over in-memory links and a child
  process that echoes in the native messaging protocol

## Chrome notifications (`winui-svelte/chrome/notifications`)

`chrome.notifications` for a native app, with Chrome's names and shapes; where
Chrome takes a callback, a method returns a promise
It delegates to the web `Notification` (`winui-svelte/web-apis/notification`),
so there is one notification pipeline: the same permission, the same Windows
app notifications and the same progress bar
Opt-in: nothing is bundled until an app imports it, importing does no work, and
no global is installed
`installNotification()` must have run, as for the web `Notification`

```ts
import { ChromeNotifications } from "winui-svelte/chrome/notifications";

const notifications = new ChromeNotifications();
notifications.onButtonClicked.addListener((id, index) => console.log(id, index));
await notifications.create("sync", {
  type: "progress",
  title: "Syncing",
  message: "Uploading photos",
  progress: 10,
  buttons: [{ title: "Pause" }]
});
await notifications.update("sync", { progress: 60 });
```

- Exports: `ChromeNotifications`, `ChromeEvent`, `NotificationTemplateType`
  (`basic`, `image`, `list`, `progress`) and `NotificationPermissionLevel`
  (`granted`, `denied`), and the option types
- `create(id, options)` resolves with the id (made up for a missing or empty
  one); the same id replaces the notification that is up, without `onClosed`
  The first call asks Windows for the permission and rejects with an `Error`
  when it is refused
- `type`, `title` and `message` are required, and so is `imageUrl` for `image`,
  `items` for `list` and `progress` (0 to 100) for `progress`; `iconUrl` is
  optional, since an unpackaged app may have none; options are checked with a
  schema and a bad one rejects with an `Error`
- `update(id, options)` merges into the notification and answers false when
  there is none; a change of `progress` alone moves the bar in place
  (`Notification.update`), anything else shows it again under its id
- `clear(id)` removes it and answers false when there is none; `getAll()`
  answers an object with each id as a key and `true` as the value, for the
  notifications this run holds
- `getPermissionLevel()` reads `Notification.permission`: `granted`, else
  `denied` (including "not asked yet", which the first `create` settles)
- `onClicked(id)`, `onButtonClicked(id, buttonIndex)` and `onClosed(id, byUser)`
  are `ChromeEvent`s; Windows removes a clicked toast, so a click is followed
  by `onClosed(id, true)`, `clear` fires `onClosed(id, false)`, and a swipe away
  is not reported
- `isClickable: false` silences `onClicked` for the body, not the buttons
- Mapping: `message` is the body, `list` adds one `title: message` line per
  item, `image` uses `imageUrl`, `contextMessage` is the attribution,
  `eventTime` the timestamp, `buttons` (at most 2) become actions named by
  their index, `priority` below 0 is silent and 2 requires interaction, and
  `requireInteraction` and `silent` pass through
- Not mirrored: `onPermissionLevelChanged` and `onShowSettings`
- `src/chrome/notifications/chrome-notifications.test.ts` runs the web
  `Notification` over a stand-in for the Windows App SDK; no toast is shown

## Chrome commands (`winui-svelte/chrome/commands`)

`chrome.commands` for a native app: the manifest's `commands` key as global
hotkeys, over `registerHotkey` of `winui-svelte/app/hotkeys`
Opt-in: nothing is bundled until an app imports it, importing does no work, and
no global `chrome` is installed

```ts
import { ChromeCommands } from "winui-svelte/chrome/commands";

const commands = new ChromeCommands({
  commands: {
    toggle: {
      suggested_key: { default: "Ctrl+Shift+Y", mac: "Command+Shift+Y" },
      description: "Toggle the panel"
    }
  }
});
commands.onCommand.addListener(name => console.log(name));
const failures = commands.start();
const all = await commands.getAll();
```

- `start()` registers every shortcut (call it on the UI thread, where
  `registerHotkey` belongs) and returns the commands whose shortcut was
  refused, as `{ name, error }`; a clash with another app leaves that command
  unassigned, so its `getAll` shortcut is empty, as in Chrome; `stop()` gives
  the shortcuts back
- `getAll()` resolves with `{ name, description, shortcut }` for each command
  in the manifest's order, the shortcut spelled `"Ctrl+Shift+Y"`
- `suggested_key` is a string or one per platform; `windows` then `default`
  is used, and `mac`, `linux` and `chromeos` are ignored
- `Ctrl`, `Alt` and `Shift` are as in Chrome; `Command` and `MacCtrl` mean
  Ctrl; keys are `A` to `Z`, `0` to `9`, `F1` to `F12`, `Comma`, `Period`,
  `Home`, `End`, `PageUp`, `PageDown`, `Space`, `Insert`, `Delete`, `Up`,
  `Down`, `Left`, `Right` and the four media keys; `parseShortcut(text)`
  reads one into the `HotkeyChord` and the display spelling, and throws for
  anything else
- A bad manifest (a shortcut Chrome would not take, or a wrong shape, checked
  with zod) throws from the constructor
- Chrome keeps most shortcuts inside the browser; a native app has no such
  scope, so every shortcut with a key is system-wide and `global` changes
  nothing
- `_execute_action` (and `_execute_browser_action`, `_execute_page_action`)
  call `onExecuteAction` when you give it, as Chrome treats them as a click on
  the action (pass `() => action.click()` of `winui-svelte/chrome/action`),
  and fire `onCommand` otherwise
- `onCommand` is a `ChromeEvent` and is called with the name only, there is no
  tab; `register` stands in for `registerHotkey` in a test
- Not mirrored: `onChanged`, and the shortcut customisation page
- `src/chrome/commands/chrome-commands.test.ts` runs it over a fake registrar,
  so no real hotkey is registered

## Chrome i18n (`winui-svelte/chrome/i18n`)

`chrome.i18n` for a native app: `getMessage` is synchronous, over the
standard `_locales/<locale>/messages.json` files, so an unmodified
extension's locale folder works
Opt-in: nothing is bundled until an app imports it, importing does no work, and
no global `chrome` is installed

```ts
import { ChromeI18n, installLanguageDefaults } from "winui-svelte/chrome/i18n";

const i18n = new ChromeI18n();
i18n.getMessage("greeting", ["Ann", "3"]);
installLanguageDefaults(i18n);
```

- `getMessage(name, substitutions)` takes a string or up to nine strings;
  `$1` to `$9` are the substitutions, `$NAME$` is the content of the
  message's `placeholders` entry of that name (which may hold `$1`), and `$$`
  is a dollar sign; names are matched without case; an unknown name gives an
  empty string, as in Chrome
- Lookup is per message: the exact locale (`pt-BR` is the folder `pt_BR`),
  then its language (`pt`), then the `default_locale` of `manifest.json`
  beside the folder; `localesFolder`, `root`, `defaultLocale`, `uiLanguage` and
  `acceptLanguages` override the defaults (the app's root, `_locales` in it,
  the system language)
- The predefined messages are `@@extension_id`, `@@ui_locale` (`en_US`),
  `@@bidi_dir`, `@@bidi_reversed_dir`, `@@bidi_start_edge` and
  `@@bidi_end_edge`
- `getUILanguage()` is a BCP 47 tag; `getAcceptLanguages()` resolves with the
  list; `detectLanguage(text)` tells scripts apart (Arabic, Hebrew, Cyrillic,
  Greek, Thai, Devanagari, Hangul, kana and Han) and answers `und` for
  Latin-script text, where Chrome uses a trained model
- Every `messages.json` is checked with zod; a malformed one throws from
  `getMessage`
- `installLanguageDefaults(source)` makes `navigator.language`,
  `navigator.languages`, the default locale of the `Intl` formats and of
  `toLocaleString` (and its date and time forms) follow the same source, so
  they agree with `chrome.i18n`; a locale a caller passes still wins; it
  returns the function that undoes it
- `src/chrome/i18n/chrome-i18n.test.ts` runs it over in-memory files

## Chrome global (`winui-svelte/chrome/install`)

`installChromeApis` defines `globalThis.chrome` for code written for a Chrome
extension
Opt-in: importing does no work, and the global holds exactly the namespaces the
app passes, so the bundle holds only what the app imported to make them

```ts
import { installChromeApis } from "winui-svelte/chrome/install";
import { ChromeI18n } from "winui-svelte/chrome/i18n";
import { ChromeStorage } from "winui-svelte/chrome/storage";
import * as alarms from "winui-svelte/app/schedule";

const uninstall = installChromeApis({
  storage: new ChromeStorage(),
  i18n: new ChromeI18n(),
  alarms
});
await chrome.storage.local.set({ theme: "dark" });
```

- `ChromeGlobal` is the options object and the type of `globalThis.chrome`; its
  members are `storage`, `runtime`, `permissions`, `contextMenus`, `commands`,
  `action`, `notifications`, `i18n`, `alarms`, `downloads`, `system` and `windows`, each optional,
  each an instance (or, for `alarms`, the `ChromeAlarms` calls and events of
  `winui-svelte/app/schedule`); the object is open to more namespaces as they
  are mirrored
- The package declares no global type; to type `chrome` in your app, declare
  `var chrome: ChromeGlobal` in your own `declare global`
- A `chrome` object that is already there keeps its other members; the
  returned function puts the previous one back
- It does not call `installLanguageDefaults`; do that where you want
  `navigator.language` and `Intl` to follow `chrome.i18n`
- `src/chrome/install.test.ts` covers it

## Chrome action (`winui-svelte/chrome/action`)

`chrome.action` for a native app, over the tray icon (`winui-svelte/tray`)
Opt-in: nothing is bundled until an app imports it, importing does no work, and
no global `chrome` is installed

```ts
import { createChromeAction } from "winui-svelte/chrome/action";

const { action, tray } = createChromeAction({
  icon: "app.ico",
  title: "Inbox",
  guid: "0b3c0a53-2a8f-4a5e-9d57-1c2f7c1a9f10"
});
action.onClicked.addListener(() => console.log("clicked"));
await action.setBadgeText({ text: "3" });
```

- `createChromeAction(options)` takes the options of `createTrayIcon` (except
  `onclick`) and `title`, makes the tray icon and returns `{ action, tray }`;
  call it on the UI thread; the left click is `onClicked`, the other gestures
  go to the tray as given; `createTray` stands in for `createTrayIcon` in a test
- `new ChromeAction({ title, tray })` is the same without making the tray: give
  the tray's `onclick` to `action.click()`, then `attach(tray)` (a tray from
  `defineTray` fits), through the `ActionTray` shape
- `setTitle({ title })` and `getTitle()` are the tooltip, kept to what the shell
  holds (127 characters)
- `setIcon({ path })` swaps the icon file; `path` is a string or
  `{ forLightTaskbar, forDarkTaskbar }`; Chrome's `imageData` and size maps
  are rejected
- `setBadgeText({ text })` and `getBadgeText()`: the tray cannot paint on an
  icon (icons are files loaded by path, and drawing needs a new icon file on
  every change), so the badge is a tooltip suffix, `"Inbox (3)"`; empty text
  clears it
- `setBadgeBackgroundColor({ color })` and `getBadgeBackgroundColor()` keep the
  color (four channels, or `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`; Chrome's
  red until set) and nothing draws it
- `enable()`, `disable()` and `isEnabled()`: a disabled action still shows
  (the tray cannot grey an icon) but a click on it is ignored
- Every method returns a promise and rejects on a bad argument (zod); `tabId`
  is accepted and ignored, there are no tabs, so everything is global
- `onClicked` is a `ChromeEvent` and is called with no argument
- Not mirrored: `setPopup`, `getPopup`, `openPopup`, `getUserSettings`,
  `setBadgeTextColor`, `onUserSettingsChanged`
- `src/chrome/action/chrome-action.test.ts` runs it over a fake tray

## Chrome system (`winui-svelte/chrome/system`)

`chrome.system` for a native app: `cpu`, `memory`, `storage` and `display`
with Chrome's names and promises, over Node's `os` and the display areas
that `winui-svelte/devices/display` and the web `screen` read
Opt-in: nothing is bundled until an app imports it, importing does no work, and
no global `chrome` is installed

```ts
import { createChromeSystem } from "winui-svelte/chrome/system";

const system = createChromeSystem();
const cpu = await system.cpu.getInfo();
const memory = await system.memory.getInfo();
const drives = await system.storage.getInfo();
const displays = await system.display.getInfo();
system.display.onDisplayChanged.addListener(() => console.log("changed"));
```

- `createChromeSystem(options)` returns `{ cpu, memory, storage, display }`
  (`SystemCpu`, `SystemMemory`, `SystemStorage`, `SystemDisplay`); nothing is
  read until a method is called; `backend` stands in for the machine in a
  test, and `windowsSystemBackend()` is the default (`SystemBackend` is its
  shape)
- `cpu.getInfo()` resolves with `numOfProcessors`, `archName` (`x86-64`,
  `arm64`, `x86-32`, `arm`), `modelName`, `features`, `processors` (the
  `kernel`, `user`, `idle` and `total` milliseconds of each) and an empty
  `temperatures`; `features` is `mmx`, `sse` and `sse2` on x64 and empty
  elsewhere, as Node reports no others
- `memory.getInfo()` resolves with `capacity` and `availableCapacity` in bytes
- `storage.getInfo()` resolves with `{ id, name, type, capacity }` for each
  drive letter, `type` one of `StorageUnitType` (`fixed`, `removable`,
  `unknown`), read with `GetDriveTypeW`
- `storage.onAttached` and `storage.onDetached` are not mirrored: Windows
  tells an app about a drive coming or going only through a hidden window's
  `WM_DEVICECHANGE` or a `DeviceWatcher` that needs a package identity; call
  `getInfo` again
- `display.getInfo(flags)` resolves with one record per display area, the
  primary first: `id`, `name` (`Display 1` and so on), `isPrimary`,
  `isEnabled`, `dpiX`, `dpiY` (the system scale times 96), `bounds` and
  `workArea` as `{ left, top, width, height }` in screen pixels;
  `mirroringSourceId` is empty and `rotation` 0, as Windows tells an app
  neither; `singleUnified` is accepted and ignored; a flag of the wrong
  type rejects (zod)
- `display.onDisplayChanged` is a `ChromeEvent` called with no argument; the
  display watcher runs only while a listener is added
- Not here on purpose: `chrome.idle` is the web `IdleDetector` and
  `chrome.desktopCapture` the web `getDisplayMedia`, both already covered
- `src/chrome/system/chrome-system.test.ts` runs it over a fake backend

## Chrome windows (`winui-svelte/chrome/windows`)

`chrome.windows` for the windows of a native app, over `WindowHandle`
Opt-in: nothing is bundled until an app imports it, importing does no work, and
no global `chrome` is installed

```ts
import { createWindow } from "winui-svelte/window";
import { chromeWindowSurface, createChromeWindows, WindowState } from "winui-svelte/chrome/windows";

const windows = createChromeWindows({
  open: () => chromeWindowSurface(createWindow({ component: Panel, props: {} }).handle)
});
windows.track({
  surface: chromeWindowSurface(mainHandle),
  isCurrent: true
});
windows.onFocusChanged.addListener(windowId => console.log(windowId));
const panel = await windows.create({ width: 400, height: 300 });
await windows.update(panel.id, { state: WindowState.maximized });
await windows.remove(panel.id);
```

- `createChromeWindows(options)` makes a `ChromeWindows`; make one and share
  it, since the windows it knows and their ids live in it; no process-wide
  list of windows exists, so the app hands it the windows
- `track({ surface, isCurrent })` starts reporting a window, gives it an id
  from 1 and fires `onCreated`; `chromeWindowSurface(handle)` makes a
  `ChromeWindowSurface` of a `WindowHandle` (`bind:handle` on `<Window>`, or
  the `handle` of what `createWindow` returns); a window leaves when it
  closes, firing `onRemoved`
- `create(createData)` calls the `open` option, which makes the content,
  tracks what it returns and then applies `left`, `top`, `width`, `height`,
  `state` and `focused`; without `open` it rejects; `url`, `tabId`, `type`,
  `incognito` and `setSelfAsOpener` reach `open` and nothing else
- `get(windowId)`, `getCurrent()`, `getLastFocused()` and `getAll()` resolve
  with a `ChromeWindow`: `id`, `focused`, `top`, `left`, `width`, `height`,
  `state`, `alwaysOnTop`, `incognito` (always false) and `type` (always
  `normal`); places and sizes are in device pixels, as `AppWindow` has them;
  `populate` and `windowTypes` are accepted and ignored, there are no tabs
- `WINDOW_ID_CURRENT` (-2) names the window `track` marked current, else the
  last focused; `WINDOW_ID_NONE` (-1) is what `onFocusChanged` reports when
  focus leaves the app's windows
- `update(windowId, updateInfo)` takes `left`, `top`, `width`, `height`,
  `state` (`WindowState`: `normal`, `minimized`, `maximized`, `fullscreen`,
  `locked-fullscreen`, the last as full screen), `focused` (true brings the
  window forward; false changes nothing) and `drawAttention` (flashes the
  taskbar button until the window is brought forward); as in Chrome a place
  or size cannot go with a state other than `normal`, and `focused` cannot go
  with `minimized`
- `remove(windowId)` closes the window; `onRemoved` fires once it has closed,
  so a close guard on the window keeps it
- Every method returns a promise and rejects on a bad argument (zod) or an
  unknown id; `WindowType` lists Chrome's types, and every window is `normal`
- `onCreated`, `onRemoved`, `onFocusChanged` and `onBoundsChanged` are
  `ChromeEvent`s; `onBoundsChanged` fires after a move or a resize
- Not mirrored: `tabs` in a window, `create`'s `focused: false` and `incognito`
  effects, and `onBoundsChanged`'s separate move and resize
- `src/chrome/windows/chrome-windows.test.ts` runs it over fake windows

## Data transfer (`winui-svelte/data-transfer`)

Drag and drop, file dialogs, the clipboard and the launcher, in the web's
shapes, over `Windows.ApplicationModel.DataTransfer`, `Windows.Storage` and
`Windows.System`
Opt-in: nothing is bundled until an app imports it, and importing does no work
Everything runs on the UI thread, from an unpackaged app

### Files: `NativeFile`

A dropped, picked or pasted file or folder is a `NativeFile`, shaped like the
web's `File`: `path`, `name`, `size`, `type` (by extension), `lastModified`,
`kind` (`FileKind.file` or `FileKind.directory`), `text()`, `bytes()`,
`arrayBuffer()`, `stream()` and, for a folder, `entries()`
It reads from the path with `node:fs`, so no WinRT stream is involved
A picture from the clipboard is a `NativeFile` with an empty `path` and its
bytes in memory
`nativeFileAt(path)` makes one from a path

### Drag events as on the web

```svelte
<script lang="ts">
  import { enableDragEvents } from "winui-svelte/data-transfer";
  import type { DragEvent } from "winui-svelte/data-transfer";

  enableDragEvents();   // once, before the first window
</script>

<border
  ondragover={(event: DragEvent) => {
    event.preventDefault();               // accept, as on the web
    event.dataTransfer.dropEffect = "copy";
  }}
  ondrop={async (event: DragEvent) => {
    for (const file of event.dataTransfer.files) {
      console.log(file.name, await file.text());
    }
  }}
>
  <text-block>Drop here</text-block>
</border>

<text-block
  ondragstart={(event: DragEvent) => event.dataTransfer.setData("text/plain", "hello")}
  ondrag={(event: DragEvent) => console.log(event.clientX, event.clientY)}
  ondragend={(event: DragEvent) => console.log(event.dataTransfer.dropEffect)}
>Drag me</text-block>
```

`enableDragEvents()` adds the seven names to the renderer's event-alias table
(`src/renderer/host/event-adapters.ts`, empty until then), so a raw element
(`<border>`, `<text-block>`, any control) takes them
A WinUI-named event on the same element (`ondragstarting`, `ondropcompleted`)
keeps working and keeps WinUI's own arguments
A handler for a drop event sets AllowDrop on the control, and one for
`ondragstart` sets CanDrag; the control gives them back when the last handler
goes
Components (`<Border>`) take no `ondrop` prop; use the attachments below on a
component

| Web event | WinUI | Notes |
|---|---|---|
| `dragstart` | `DragStarting` | fills `dataTransfer` (`setData`, `items.add`, `files`); `preventDefault()` cancels; the handler may be async; the data package is built when it returns |
| `drag` | none | emulated: every 50 ms from the start of the drag to its end, with the cursor read by `GetCursorPos` (read only) and converted to window coordinates |
| `dragend` | `DropCompleted` | `dataTransfer.dropEffect` is what the target did, `none` when cancelled |
| `dragenter`, `dragover` | `DragEnter`, `DragOver` | the cursor shows the effect; `types` is readable, the files and text are not yet, as on the web |
| `dragleave` | `DragLeave` | |
| `drop` | `Drop` | all data is read first (a deferral keeps the drop open); `files` are `NativeFile` |

A target accepts a drag when a `dragenter` or `dragover` handler calls
`event.preventDefault()`; with no such handler (only `ondrop`) every drag is
accepted
`dropEffect` starts as the source's preferred effect (copy, then move, then
link) and the handler may change it; the cursor and the source's
`DropCompleted` get that effect
`event.setFeedback({ caption, isGlyphVisible, isContentVisible })` changes
WinUI's drag visual while over a target

`DragEvent` has `type`, `target`, `currentTarget`, `relatedTarget` (always
null), `dataTransfer`, `clientX`/`clientY` (window content, in device-independent
pixels), `offsetX`/`offsetY` (the control), `altKey`, `ctrlKey`, `shiftKey`,
`defaultPrevented`, `preventDefault()` and `stopPropagation()`

`DataTransfer` has `types`, `files`, `items` (`DataTransferItemList`: `length`,
`at`, `add`, iteration; items have `kind`, `type`, `getAsString`, `getAsFile`),
`getData(type)`, `setData(type, value)`, `clearData(type?)`, `effectAllowed`
(`EffectAllowed`), `dropEffect` (`DropEffect`), `setDragImage` (accepted, WinUI
draws its own preview) and `bitmap` (a picture to drag)
The standard formats are `text/plain` (Text), `text/html` (the fragment of the
HTML format), `text/uri-list` (Uri), `Files` (StorageItems) and, for a picture,
a `NativeFile` in `files`; any other format id is a custom text format, listed
in `types` and readable when named in `formats`

### Attachments: `dropzone`, `draggable`, `filePicker`

```svelte
<Border {@attach dropzone({
  accept: ".png,.jpg,image/*,directory",
  isSingle: false,
  onDragStateChange: isOver => (highlight = isOver),
  onDrop: event => add(event.dataTransfer.files),
  onReject: event => warn(event.dataTransfer.files)
})}>

<TextBlock {@attach draggable({ text: "hello", files: [file], effectAllowed: "copy" })}>
<Button {@attach filePicker({ accept: "image/*", multiple: true, onPick: files => add(files) })}>
```

`dropzone(options)`: the simple form of a target, for components and elements
`accept` is `<input accept>`'s grammar, as a string or a list: extensions
(`.png`), media types (`image/*`, `text/plain`) and the kinds of `DataKind`
(`file`, `directory`, `text`, `html`, `uri`, `bitmap`); empty accepts all
A drag is judged by its kinds while over the zone (the cursor shows the
forbidden sign for the rest) and the dropped files by name and type; those that
fail go to `onReject`
`isSingle` keeps the first passing file
`formats` names custom text formats to read on the drop
`onDragStateChange(isOver)` is the hook for a highlight (set a class from it)
An element with no background gets a transparent one while it is a zone,
because WinUI only hits painted areas; put `dropzone` on the root element of the
window's content to take drops anywhere on the window
`onDragEnter`, `onDragOver`, `onDragLeave` and `onDrop` take the same
`DragEvent` as the web names

`draggable(options)`: `text`, `html`, `uri`, `files`, `bitmap`, `effectAllowed`,
and `onDragStart` / `onDrag` / `onDragEnd`
Drag out to Explorer works with `files` (paths become `StorageFile` and
`StorageFolder`)

`filePicker(options)`: a click on the element opens `pickFiles` over its
window and calls `onPick` with the files; not called on cancel

### Pickers

`pickFiles({ owner, accept, multiple, directory, title, commitButtonText,
startIn, startFolder, settingsIdentifier })` returns `NativeFile[]` (empty on
cancel); `pickSaveFile({ owner, accept, suggestedFileName, defaultFileExtension,
... })` returns a path or null
`owner` is a control (its window comes from its XamlRoot) or a `WindowHandle`
`accept` gives the file type filter (media types become their extensions);
`["directory"]` alone, or `directory: true`, picks a folder
`startIn` is `PickerLocation` (the same table as `WindowHandle`'s dialogs; the
picker code in `src/window/pickers.ts` is the one used)

### Clipboard

`clipboard.readText()`, `readHtml()`, `read({ formats })` (a `DataTransfer`),
`types()`, `writeText(text)`, `write({ text, html, uri, files, bitmap, custom,
shouldPersist, deferred })`, `clear()` and `onChange(callback)` (returns what
stops it)
`write` replaces the clipboard's whole content
`deferred` maps a type to a provider (`() => Promise<string | NativeFile>`) that
Windows runs when something pastes, through `DataPackage.SetDataProvider`; a
source does the same for a drag with `event.dataTransfer.setDeferredData({
type, provider })` in `dragstart`, and the data is made at the drop
A type starting with `image/` is a picture, so its provider gives a `NativeFile`
A provider that rejects leaves its format empty
Windows runs a provider on the UI thread, and `shouldPersist` runs them at
once, before the app exits

### Launcher and share

`launchUri(url)`, `launchFile(path)`, `openFolder(path)` and
`revealInExplorer(path)` (starts `explorer.exe /select`, because the Launcher
cannot select an item)
`share({ title, text, html, uri, files, window })` opens the share pane from
`window` (a `WindowHandle` or the native `Window`) and throws
`ShareUnavailableError` where Windows has none; without `window` it needs a
package identity

What works from an unpackaged process (checked from `node.exe`): the drag and
drop data mapping on real `DataPackage` objects (text, HTML, link, custom
formats, files, folders, a picture), `Clipboard.GetContent` and the Launcher
queries
The share pane needs a window there: `DataTransferManager.GetForCurrentView`
fails with "cannot be called while the app is in the background" without a
package identity, so `share({ window })` calls `IDataTransferManagerInterop`
(`GetForWindow`, then `ShowShareUIForWindow`), which is in shobjidl_core.h and
not in the metadata: its two methods are declared by hand at the slots after
`IUnknown`'s (it does not derive from `IInspectable`)
`GetForWindow` is checked from `node.exe`; `ShowShareUIForWindow` is not, because
it would open the real pane
The Launcher's `findUriSchemeHandlers` returns none without identity

### Names and testing

`FormatType` names the standard formats (`text/plain`, `text/html`,
`text/uri-list`, `Files`, `image/png`); `DropEventType` (`dragenter`, `dragover`,
`dragleave`, `drop`) and `DragSourceEventType` (`dragstart`, `drag`, `dragend`)
name the events `enableDragEvents` adds
`simulateDrop({ control, transfer })` drops a `DataTransfer` on a control that
takes drops, through the handlers a real drop reaches, and resolves with the
operation the control accepted (`0` when it refused); it sends no input, so an
app can test its drop handling in a real window

## Progress (`winui-svelte/progress`)

One progress object for any long work: a download, a file read, a copy, an OCR
pass; it is a promise, an `EventTarget` with the platform events, and
reactive state, in one value
Operations list themselves in an app-wide registry, so the taskbar button and
the tray show them with no setup
Opt-in: nothing is bundled until an app imports it, and importing does no work

### Five call sites

```svelte
<script lang="ts">
  import { Button, ProgressBar, TextBlock, Window } from "winui-svelte/components";
  import { fetchToFile } from "winui-svelte/downloads";
  import { TaskbarProgress } from "winui-svelte/progress";

  // 1. A download with a bar: fetchToFile returns the operation at once
  const download = fetchToFile({ url, handle });
  download.then(size => console.log("saved", size));   // or: await download
</script>

<Window>
  <TaskbarProgress />                           <!-- 4. the taskbar shows every running operation -->
  <ProgressBar {...download.barProps} />        <!-- value, isIndeterminate, showPaused, showError -->
  <TextBlock>{download.loaded} of {download.total ?? "?"}</TextBlock>
  <Button onclick={() => download.cancel()}>Cancel</Button>
</Window>
```

```ts
// 2. Reading a file from disk, with progress and cancel
const read = handle.read({ onprogress: event => console.log(event.loaded, event.total) });
const file = await read;                 // a File, like getFile()
read.cancel();                           // or abort the signal given in the options

// 3. Any other long work: one call, no lifecycle code
const copy = trackOperation({
  label: "Copying photos",
  group: "sync",
  async run(operation) {
    for await (const chunk of source) {
      await write(chunk);
      operation.update({ loaded: (written += chunk.byteLength), total });
      operation.signal.throwIfAborted();
    }
  }
});

// 5. Retry: a failed fetchToFile continues where it stopped
await fetchToFile({ url, handle, resume: true });
```

```svelte
<!-- Tray menu, in tray.svelte markup -->
<TrayMenu>
  <TrayMenuProgress id="progress" />                  <!-- "setup.exe - 45%", hidden when idle -->
  <TrayMenuOperations id="operations" label="Running" emptyLabel="Nothing running" />
</TrayMenu>
```

`{...download.barProps}` spreads onto a `ProgressBar`; Svelte then cannot tell
at build time whether a scoped class selector matches that bar, so write the
five props out when the same component has a `<style>` rule for its siblings

### Several windows and tray icons

The registry is app-wide; what a taskbar button or a tray line shows is scoped
by `group` (a name an operation is given) or by an operation or registry given
as `of`
A `<TaskbarProgress />` drives the taskbar button of the window it sits in;
`window={handle}` picks another

```svelte
<script lang="ts">
  const upload = trackOperation({ group: "uploads", run });
  const download = fetchToFile({ url, handle, group: "downloads" });
</script>

<!-- Window A: its taskbar button shows the downloads only -->
<Window bind:handle={windowA}>
  <TaskbarProgress group="downloads" />
</Window>

<!-- Window B: its own button shows one upload; window A is not touched -->
<Window>
  <TaskbarProgress of={upload} />
</Window>

<!-- The main window drives window A from outside -->
<TaskbarProgress window={windowA} group="downloads" />

<!-- Two tray icons, each with its own menu and its own scope -->
<TrayIcon>
  <TrayMenu>
    <TrayMenuProgress id="downloads" group="downloads" />
  </TrayMenu>
</TrayIcon>
<TrayIcon>
  <TrayMenu>
    <TrayMenuOperations id="uploads" label="Uploads" group="uploads" />
  </TrayMenu>
</TrayIcon>
```

### `ProgressOperation`

- It is `PromiseLike`: `await operation` gives the value passed to `complete`
  and throws the reason of `fail` or `cancel` (an `AbortError` by default); an
  operation nobody awaits raises no unhandled rejection
- It is an `EventTarget` that fires `loadstart`, `progress`, `load`, `error`,
  `abort` and `loadend` as `OperationProgressEvent` (`lengthComputable`,
  `loaded`, `total`), in the order `XMLHttpRequest` and `FileReader` use, plus
  `pause`, `resume` and `change`; `onprogress` and its kin work as properties
  and as options
- `value` (0 to 1), `loaded`, `total`, `state`, `isIndeterminate`,
  `showPaused`, `showError`, `label` and `barProps` are reactive in markup and
  in `$effect`, with the meaning `ProgressBar` gives them: a total that is
  unknown is indeterminate
- `$operation` works too: it has `subscribe` and so is a Svelte store
- `signal` is an `AbortSignal` that aborts on `cancel()`; a `signal` given to
  the constructor cancels the operation when it aborts
- `start`, `update({ loaded, total })`, `pause`, `resume`, `complete(value)`
  and `fail(reason)` are for the code doing the work; `resume` also retries an
  errored operation (the other final states are final)
- `ProgressState` is the closed set of states: `idle`, `running`, `paused`,
  `complete`, `error`, `canceled`

### Registry and scopes

- `defaultProgressRegistry()` is the app-wide registry; an operation lists
  itself there unless it gets `registry: otherRegistry` or `registry: false`
- A finished or canceled operation leaves; a failed one stays so a red bar
  is not lost, until `clearFailed()` or `remove(operation)`
- `registry.where("sync")` or `registry.where(operation => ...)` is a scoped
  registry that follows the first (call `dispose()` when done);
  `<TaskbarProgress group>` and the tray components do this for you
- `snapshot`, `value`, `count`, `state`, `isIndeterminate`, `showPaused` and
  `showError` are the aggregate: the bar covers the operations that know their
  total, and is indeterminate only when none does; `paused` when all that are
  left are paused; `error` when only failed ones are left; `count` is the
  number unfinished
- `aggregateSnapshots` is that rule as a pure function

### Taskbar and tray

- `<TaskbarProgress of group window taskbar />` draws nothing and keeps the
  taskbar button in step: a bar, a marquee when the total is unknown, paused
  yellow, error red, gone when nothing is left; the shell is told only when the
  bar moves by a thousandth
- `bindTaskbarProgress({ source, taskbar })` is the same without markup (the
  `taskbar` option of `Downloads.download` uses it); `taskbarOptionsOf` is the
  mapping
- `<TrayMenuProgress id of group />` is a command line with the text of
  `progressText(snapshot)`, hidden while nothing runs; `onselect` is yours
- `<TrayMenuOperations id label of group />` is a submenu with a line per
  running operation; picking a line cancels it
- `Downloads` gives each download an operation (`progress: registry` in its
  options picks the registry, `group` in `download({ ... })` the group), and
  `fetchToFile` returns one; `FileSystemFileHandle.read` is the extra (WinUI
  only) that reads a file in 1 MiB chunks
- `trackStream({ stream, operation })` passes a `ReadableStream` through and
  reports the bytes; `trackOperation` is the whole lifecycle for any async work

## Incremental loading (`winui-svelte/incremental`)

A list that loads its next batch as the user scrolls near the end, for
`ListView`, `GridView`, `ItemsRepeater`, `ItemsView` and `BreadcrumbBar`
Opt-in: nothing is bundled until an app imports it, and importing does no work

```svelte
<script lang="ts">
  import { ListView } from "winui-svelte/components";
  import { createIncrementalSource, IncrementalStatus } from "winui-svelte/incremental";

  const source = createIncrementalSource<Post>({
    batchSize: 25,
    load: ({ offset, count, signal }) => fetchPosts({ offset, count, signal })
  });
</script>

<ListView incremental={source} item={postRow} items={source.items} key={post => post.id} />
{#if source.state.status === IncrementalStatus.ERROR}
  <button onclick={() => source.retry()}>Try again</button>
{/if}
```

`createIncrementalSource({ load, batchSize, threshold, isLast })` (options:
`IncrementalSourceOptions`) returns an `IncrementalSource`, generic over the item;
`IncrementalLoading` is what a list asks of its `incremental` prop
`load({ offset, count, signal })` resolves with the next items; fewer than
`count` (or none) is the last batch, and `isLast({ batch, items })` decides when
the size cannot (a server that sends a cursor)
`batchSize` is 20 and `threshold` is 5 by default: the next batch loads when
the control realizes an item within `threshold` of the end
The source holds `items` and `state`, both reactive
`state` is `{ status: "idle" | "loading" | "done" }` or
`{ status: "error", error }`; `IncrementalStatus` names the four (also in
`winui-svelte/enums`)

- `loadMore()` loads now; while a load is in flight it returns that load's
  promise, so a load never runs twice, and it never rejects
- A failure is the `error` state and stays until `retry()`; the list does not
  retry by itself
- `cancel()` aborts the load in flight through its `AbortSignal` and drops its
  result; `reset()` also clears the items, and a bound list loads the first
  batch again; `dispose()` aborts for good
- A list bound to a source starts it, so the first batch needs no call

### The mechanism, and why

WinUI's own is `ISupportIncrementalLoading` on the items source, which the
list calls when it nears its end (`IncrementalLoadingTrigger`)
winui-svelte does not use it: the items of these lists are a native vector of
keys (see Items), and the interface belongs on the collection itself, which
would have to be a JavaScript-made `IBindableVector`,
`INotifyCollectionChanged` and `ISupportIncrementalLoading` returning an
`IAsyncOperation`
dynwinrt (0.1.0-preview.23) can make a COM object from a callback
(`createComObject`), but nothing in this package has proved that WinUI binds it
as an items source, and the same table would have to answer a bindable vector's
every call, so it was not built
Instead the control's own realization tells the source: ListView and GridView
report each container's index through `ContainerContentChanging`, the repeaters
through `ElementPrepared`, and the source loads when that index is within
`threshold` of the end
The report is made after the layout pass (a timer of zero, the furthest index of
the pass), because a source that changes `state` during it changes the app's
markup (a footer) while WinUI measures, which WinUI refuses
`ScrollViewer.ChangeView` and a real scroll reach the source the same way
(`test/incremental-list.test.ts`)

A loading footer, an error row or a "no more" line is markup of the app, beside
the list, from `source.state`; the list has no footer snippet of its own
The example is `examples/incremental-list`

## Input events and focus (`winui-svelte/input`)

The web's pointer, wheel, keyboard and focus events on any element, and focus
management, over `Microsoft.UI.Xaml.Input`
Opt-in: nothing is bundled until an app imports it, and importing does no work
Everything runs on the UI thread

### Events as on the web

```svelte
<script lang="ts">
  import { enableInputEvents, setPointerCapture, PointerType } from "winui-svelte/input";
  import type { KeyboardEvent, PointerEvent } from "winui-svelte/input";

  enableInputEvents();   // once, before the first window
</script>

<border
  onpointerdown={(event: PointerEvent) => {
    setPointerCapture({ control: event.currentTarget, pointerId: event.pointerId });
    const isPen = event.pointerType === PointerType.pen;
    console.log(event.clientX, event.clientY, isPen ? event.pressure : 1);
  }}
  onpointermove={(event: PointerEvent) => {
    for (const point of event.getCoalescedEvents()) {
      console.log(point.x, point.y);
    }
  }}
  onkeydown={(event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
    }
  }}
>
  <text-block>Draw here</text-block>
</border>
```

`enableInputEvents()` adds the eleven names to the renderer's event-alias table
(`src/renderer/host/event-adapters.ts`, the one `enableDragEvents()` fills), so a
raw element takes them
A WinUI-named event on the same element (`onpointerpressed`) keeps WinUI's own
arguments, and so does every component prop: components get no new props
`onkeydown` is the one name both share; on a raw element it takes the web's
`KeyboardEvent` once the events are enabled

| Web event | WinUI | Notes |
|---|---|---|
| `pointerdown`, `pointerup`, `pointermove` | `PointerPressed`, `PointerReleased`, `PointerMoved` | `pointerId`, `pointerType` (`PointerType.mouse`, `pen`, `touch`; a touchpad is a mouse), `isPrimary`, `pressure`, `tiltX`, `tiltY`, `twist`, `button`, `buttons`, `clientX`, `clientY` (also `offsetX`, `pageX`, `x`), the four modifiers |
| `pointerenter`, `pointerleave` | `PointerEntered`, `PointerExited` | WinUI bubbles them, the web does not |
| `pointercancel` | `PointerCanceled` | |
| `wheel` | `PointerWheelChanged` | `deltaX`, `deltaY` (positive when the wheel turns toward the user), `deltaMode` (always 0, pixels; WinUI gives 120 per notch) |
| `keydown`, `keyup` | `KeyDown`, `KeyUp` | `key` and `code` mapped from `VirtualKey`, `repeat`, the modifiers read from the keyboard state |
| `focusin`, `focusout` | `GotFocus`, `LostFocus` | `target`, `currentTarget`; no `relatedTarget` |

`event.getCoalescedEvents()` lists the points the pointer passed since the last
event, oldest first, as plain field objects (`x`, `y`, `pressure` and the rest)
`event.preventDefault()` and `stopPropagation()` both mark the WinUI event
handled, so it goes no further up the tree and the control skips its own
handling (a handled `keydown` for Tab does not move focus)
`event.target` is `originalSource` (the element the event started at) and
`event.currentTarget` the element the handler is written on

Limits:

- `key` and `code` assume the US layout, because WinUI's `VirtualKey` has no
  punctuation keys (they are `Unidentified`) and Shift does not turn `1` into
  `!`; read text from a `TextBox`, not from `keydown`
- `isComposing` is always false: WinUI sends input method text to the text
  controls, not to `KeyDown`
- `mouse*` and `click` are not provided; use the pointer names, or the
  `click` prop of a component
- `getCoalescedEvents` entries are field objects, not full events

### Pointer capture

```ts
setPointerCapture({ control, pointerId });     // returns true when WinUI took it
hasPointerCapture({ control, pointerId });
releasePointerCapture({ control, pointerId });
```

WinUI captures a `Pointer` object where the web captures an id, so the element
remembers every pointer its input events carried; capturing an id that has not
reached the element yet throws
Call it from a `pointerdown` handler, as on the web

The Canvas 2D of `winui-svelte/win2d/context-2d` reads the same fields (one
implementation), so a drawing library on a canvas sees the same `pointerType`,
`pressure`, tilt and coalesced events

### Focus

```svelte
<script lang="ts">
  import { activeElement, moveFocus, trapFocus } from "winui-svelte/input";
  import { FocusNavigationDirection } from "winui-svelte/enums";

  const active = activeElement();   // active.current: the focused FrameworkElement or null
</script>

<StackPanel {@attach trapFocus()}>
  <Button onclick={sender => moveFocus({ direction: FocusNavigationDirection.Down, within: sender })}>
    Down
  </Button>
</StackPanel>
```

| API | Web | Notes |
|---|---|---|
| `activeElement().current` | `document.activeElement` | reactive; kept by `FocusManager`'s `GotFocus` and `LostFocus`, so it is null until focus first moves after the call; call it while a component initialises |
| `moveFocus({ direction, within })` | none | `Up`, `Down`, `Left`, `Right` over XY focus navigation; `within` is any loaded element of the window; WinUI refuses `Next` and `Previous` in a desktop app, so those throw |
| `trapFocus({ shouldFocusFirst })` | a focus trap | an attachment: sets `TabFocusNavigation` to `Cycle` (Tab after the last control goes to the first, Shift+Tab before the first to the last), moves focus in when the element is shown, gives it back to where it was when the element goes |
| `FocusNavigationDirection` | none | in `winui-svelte/enums` |
| `focusElement` | `element.focus()` | in `winui-svelte`, see Reactive readers of an element |

`FocusManager.GetFocusedElement()` without a window returns nothing in a desktop
app, which is why `moveFocus` takes `within` and `trapFocus` reads the focus by
the element's own window
A trap cannot stop focus leaving through the title bar or another window

## Web APIs (`winui-svelte/web-apis`)

The standard Web APIs over WinRT and Win32, installed on demand; the package
adds no bespoke API for a feature the web already names
The table below lists every API with its subpath, kind and the identity it
needs

### Every API and its subpath

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
| `ScrollTimeline`, `ViewTimeline`, `element.animate(keyframes, { timeline })` | `winui-svelte/scroll-timeline` | web | none | done |
| `document.startViewTransition`, `ViewTransition`, `view-transition-name` | `winui-svelte/view-transitions` | web plus extras | none | done |
| `alert`, `confirm`, `prompt` | `winui-svelte/dialogs` | web (as promises) plus extras | none | done |
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
| `FontFace`, `document.fonts` (font files of the app) | `winui-svelte/web-apis/fonts` | web plus extras | none | done |
| `createImageBitmap`, `ImageBitmap`, `ImageDecoder`, canvas `toBlob`, `convertToBlob`, `toDataURL` (PNG, JPEG, GIF, BMP, TIFF) | `winui-svelte/web-apis/images` | web plus extras | none | done |
| `navigator.contacts` (Contact Picker) | `winui-svelte/web-apis/contacts` | web plus extras | for most apps, package identity | done |

Every row is built and tested; the timers (`setTimeout`, `setInterval`,
`setImmediate`) and `fetch` need no install, because the window thread has them
from `runWindow` (see [Timers and I/O](https://github.com/avi12/winui-svelte/blob/main/API.md#timers-and-io))
An "As is" class needs no row: every bound WinRT class is one import away

### Installing

- `installWebApis({ apis })` runs the listed installers and returns one
  uninstall; `runWindow({ webApis })` does it on the window thread before
  `onStart`
- Each API exports `install<Name>()` returning an uninstall function: it
  defines the global (or a `navigator` property), with `Symbol.toStringTag`
  and the spec's `EventTarget` inheritance, and a test can put it away again
- Nothing is defined at import time; `defineProperty` and
  `defineNavigatorProperty` are the helpers an installer uses
- The realm is the window thread (a worker); the host's main thread has no
  window, so install there only what needs none
- `domException` and `DomErrorName` give the errors the specs name
  (`NotAllowedError`, `NotSupportedError`, `SecurityError`, `InvalidStateError`,
  `NotFoundError`, `NotReadableError`, `QuotaExceededError` and the rest of
  the closed set); a new API adds its name there, not as a local string
- `HandlerEventTarget` is the `EventTarget` with `onclick`-style properties

### Permissions

`installPermissions()` defines `navigator.permissions`; `Permissions`,
`PermissionStatus` (an `EventTarget` with `change`), `PermissionName` (the
names the APIs register: `geolocation`, `accelerometer`, `screen-wake-lock`
and so on) and `PermissionStateName` (`granted`, `denied`, `prompt`) are the
spec's; an API registers its permission
with `registerPermission({ name, provider })` and calls
`announcePermissionChange(name)` when it moves, so open statuses fire `change`; a provider may add `request()` (the system
prompt), which `requestPermission(name)` calls and `readPermission(name)` reads
back, as `chrome.permissions` does

### The three kinds and the extras convention

1. **Web**: standard behaviour only
2. **Web plus extras**: every extra is an optional lowerCamelCase member of the
   API's own options or objects, documented as WinUI-only and ignored anywhere
   else, and typed by declaration merging that ships with the subpath
   (`NotificationExtras` merges into the global `NotificationOptions`); with no
   extra used the behaviour is the spec's
3. **As is**: no Web counterpart; use the WinRT class through the shipped
   bindings (`winui-svelte/bindings/windows/security/credentials/PasswordCredential`:
   the namespace lowercased and hyphenated per segment, then the class name as
   WinRT spells it; the `.d.ts` ships beside it; `#winui/*` is the app's own
   route for classes it generates itself), whose names mirror WinRT: async operations are
   promises, events are `onX(callback)` returning an unsubscribe function,
   vectors iterate, properties are accessors, `default` and `arguments` get a
   trailing underscore; bind a class that is missing by adding it to
   `lateClasses` and running `pnpm bindings:after-winapp`

### Notification (`winui-svelte/web-apis/notification`)

`installNotification({ identity, appUserModelId })` defines
`globalThis.Notification` over `AppNotificationManager`

- `Notification.permission` (one of the `NotificationPermission` values) is `default` until `requestPermission()`, which
  registers the process: `granted` when it works and Windows has notifications
  on for the app, `denied` when it throws (an unpackaged app without a name and
  an icon, no support) or the user or policy turned them off
- `new Notification(title, options)` takes the standard `body`, `tag`,
  `icon` (app logo), `image`, `data`, `silent`, `requireInteraction`
  (means `scenario: "reminder"`), `timestamp`, `renotify`, `actions` (up to
  `Notification.maxActions`); with no permission it fires `error` and shows
  nothing; `show` fires after the toast is handed to Windows
- A second notification with the same `tag` (and `group`) replaces the first,
  which fires `close`; `close()` removes the toast; Windows reports no
  dismissal by the user, so `close` fires for those two only
- `click` is a `NotificationClickEvent`: the standard `notification`, plus
  `action` (the clicked button's `action`, empty for the body) and `userInput`
  (text and selection values by input `id`)
- Extras (all optional, WinUI-only): `buttons` (`type` of `button`, `text-input`
  or `selection`, with `style`, `tooltip`, `icon`, `inputId`), `progress`
  (`title`, `status`, `value`, `valueStringOverride`) changed later with
  `await notification.update({ progress })`, `scenario` (`reminder`, `alarm`,
  `incomingCall`, `urgent`), `expiration`, `group`, `hero`, `audio` (`default`,
  `im`, `mail`, `reminder`, `sms`, `alarm` to `alarm10`, `call` to `call10`),
  `attribution`
- Listing and clearing: `notificationRegistration().getNotifications({ tag })`
  (`NotificationRegistration`, the notification members of a `ServiceWorkerRegistration`, which has no
  service worker here) lists what this run showed and Windows still holds
  (`AppNotificationManager.GetAllAsync`), so one the user dismissed in the
  notification center is not listed; one an earlier run showed has no object
  to return and is not listed; `Notification.closeAll()` (WinUI-only) closes
  the ones this run holds and calls `RemoveAllAsync`, which clears the earlier
  run's as well
- Scheduling: `showTrigger: new TimestampTrigger(Date.now() + 60_000)` shows
  the notification at that moment, even after the app has exited
  (`Windows.UI.Notifications`' `ScheduledToastNotification`, built from the
  same toast XML; the App SDK manager has no schedule); only a process with
  package identity can schedule, and without it the constructor throws
  `NotSupportedError`; a scheduled notification fires no `show`, and
  `close()` before the moment takes it out of the schedule; not exercised for
  real here (`node.exe` has no identity), so the tests cover it with a fake
  backend
- Package identity: not needed to show; an unpackaged app registers with
  `identity` (name and icon file) and `appUserModelId`; the `urgent` scenario
  and tooltips need a recent Windows build; a click after the process has gone
  starts nothing unpackaged; `useButtonStyle` has no call in the builder, so
  it is not exposed
- `NotificationBackend` is the one interface the real manager and the tests
  implement; `notify` shares it, so `scenario`, `controls` and `progress` are
  available there too

### Push, badging and launch (`winui-svelte/web-apis/push`, `/badging`, `/launch`)

Push and badges need an app with package identity (or a registered
AppUserModelId); an unpackaged process gets `NotSupportedError` rather than a
silent failure

- `installPush({ remoteId, backend })` defines `PushManager`,
  `PushSubscription`, `PushSubscriptionOptions`, `PushMessageData`, `PushEvent`
  and `navigator.pushManager` over `PushNotificationManager`
  `subscribe({ userVisibleOnly, applicationServerKey })` opens a WNS channel
  and the subscription's `endpoint` is the channel URI; `getSubscription()`,
  `unsubscribe()` (closes the channel), `permissionState()` and `toJSON()` are
  the spec's; `getKey()` is `null`
  The `push` permission is `granted` when Windows supports push for the
  process, `denied` otherwise; a message fires `push` on
  `navigator.pushManager` with `event.data` (`text()`, `json()`, `bytes()`)
  WinUI-only: `remoteId`, the Azure app id WNS knows the app by (here or at
  install; without it `subscribe` rejects with `NotSupportedError`)
- `installBadging({ backend })` defines `navigator.setAppBadge(count)` (a
  count, no argument for the attention glyph, zero clears),
  `clearAppBadge()` over `BadgeNotificationManager`; a non-integer or negative
  count is a `TypeError`
  WinUI-only: `navigator.setAppBadgeGlyph(glyph)` with a `BadgeGlyph`
  (`alert`, `available`, `away`, `busy`, `newMessage` and so on)
  Without identity Windows refuses and the call rejects, unless
  `installBadging({ fallback: taskbarBadgeBackend(handle.taskbar) })` is given:
  the badge is then drawn as an overlay icon on that window's taskbar button
  (a red disc with the count, 99+ above 99, or the glyph's colour and mark),
  see "Taskbar button"
- `installLaunch({ initialArguments })` defines `launchQueue` (a `LaunchQueue`) with `setConsumer`
  The start's command line is the first launch; each later copy's is handed
  over with `launchQueue.enqueueActivation(activation)` (WinUI-only), which
  takes what `ensureSingleInstance`'s `onRedirect` receives
  `LaunchParams.targetURL` is the first `scheme:` argument, `files` are the
  existing paths, as the file-system API's own `FileSystemFileHandle` (`name`, `getFile()`, the WinUI-only `path`)
  Launches wait for the consumer; registering the protocol or file type with
  Windows is `winui-svelte/app/activation`'s job (see Activation)

### Location and device state

Six installers, each its own subpath; every one takes a `backend` or `source`
in its options so a test needs no WinRT, and listens to Windows only while
installed

#### Geolocation (`winui-svelte/web-apis/geolocation`)

`installGeolocation()` defines `navigator.geolocation` and the
`Geolocation`, `GeolocationPosition`, `GeolocationCoordinates` and
`GeolocationPositionError` globals over `Geolocator`

- `getCurrentPosition(success, error, options)`, `watchPosition` and
  `clearWatch` with the standard `enableHighAccuracy` (a 10 meter accuracy
  request), `maximumAge` and `timeout`; a failure is a
  `GeolocationPositionError` with code 1 (`PERMISSION_DENIED`), 2
  (`POSITION_UNAVAILABLE`) or 3 (`TIMEOUT`)
- Permission `geolocation`: `prompt` until the first call, then what
  `Geolocator.RequestAccessAsync` answered (`granted` for Allowed, `denied`
  for Denied); the Windows location switch off reads as denied
- Extras, all optional and WinUI-only: on the position `positionSource`
  (`satellite`, `wifi`, `ip-address` and more), `isRemoteSource`,
  `satelliteData` (the dilutions of precision) and `civicAddress` (country,
  state, city, postal code); in the options `desiredAccuracyInMeters`,
  `reportInterval` and `movementThreshold`
- The `GeolocationAccessStatus`, `PositionAccuracy` and `PositionSource`
  enums are placeholders in the generated bindings, so the module reads their
  numbers by value
- The backend for tests is a `GeolocationBackend`; `windowsGeolocationBackend`
  is the real one, `GeolocationFailure` (with a `GeolocationFailureReason` of
  `denied`, `unavailable` or `timeout`) is what it rejects with,
  `GeolocationAccess` is `allowed`, `denied` or `unspecified`, and
  `GeolocationErrorCode` holds the three codes

#### Battery (`winui-svelte/web-apis/battery`)

`installBattery({ source })` defines `navigator.getBattery()` and
`BatteryManager` over the `battery` source of `winui-svelte/devices`

- `charging`, `chargingTime`, `dischargingTime` (seconds, `Infinity` when
  Windows cannot say), `level` (0 to 1) and the four change events with their
  `on` properties; a desktop with no battery is charging at level 1
- Windows is read and listened to from the first `getBattery()` call
- Extras: `hasBattery`, `isEnergySaverOn`, `chargeRateMilliwatts`,
  `designCapacityMilliwattHours`, `fullChargeCapacityMilliwattHours` and
  `remainingCapacityMilliwattHours`

#### Network (`winui-svelte/web-apis/network`)

`installNetwork({ source })` defines `navigator.connection`,
`navigator.onLine` and the `online` and `offline` events over the
`networkInformation` source

- `type` (`wifi`, `cellular`, `ethernet`, `none`), `effectiveType` (from the
  cellular signal bars; wired and Wi-Fi read as `4g`), `saveData` (true on a
  metered connection) and `change`
- Windows reports no throughput, so `rtt`, `downlink` and `downlinkMax` are
  the nominal figures of the effective type
- `online` and `offline` go to the global scope; a runtime with no window gets
  a small event target for them
- Extras: `isOnline`, `connectivityLevel`, `profileName`, `costType`,
  `isRoaming`, `isOverDataLimit`, `isApproachingDataLimit`, `signalBars` and
  `profileNames`
- `EffectiveConnectionType` and `ConnectionType` list the values of
  `effectiveType` and `type`

#### Gamepad (`winui-svelte/web-apis/gamepad`)

`installGamepad({ backend })` defines `navigator.getGamepads()`, `Gamepad`,
`GamepadButton`, `GamepadHapticActuator` and `GamepadEvent` over
`Windows.Gaming.Input.Gamepad`

- Four slots, each a `Gamepad` in the `standard` mapping (17 buttons, 4 axes
  with up as negative) or null; `gamepadconnected` and `gamepaddisconnected`
  fire on the global scope as Windows reports controllers, and the first
  `getGamepads()` call reports those already connected
- `vibrationActuator.playEffect("dual-rumble", ...)` with `startDelay`,
  `duration`, `strongMagnitude` and `weakMagnitude`, resolving `complete` or
  `preempted`; `reset()` stops
- Windows delivers input to a window that has focus, so a background process
  reads neutral values; the guide button has no Windows counterpart and reads
  as never pressed
- Extras: `playEffect("trigger-rumble", { leftTrigger, rightTrigger })`,
  `isWireless` and `batteryPercent`
- `windowsGamepadBackend` is the real `GamepadBackend`; a test gives devices
  with `read`, `vibrate` and `battery`

#### Sensors (`winui-svelte/web-apis/sensors`)

`installSensors({ backend })` defines `Sensor` and, for each sensor the machine
has, `Accelerometer` (meters per second squared, gravity included),
`Gyroscope` (radians per second), `Magnetometer` (microtesla),
`AbsoluteOrientationSensor`, `RelativeOrientationSensor` (`quaternion`,
`populateMatrix`) and `AmbientLightSensor` (lux) over `Windows.Devices.Sensors`

- `new Accelerometer({ frequency })`, `start()`, `stop()`, `activated`,
  `hasReading`, `timestamp` and the `activate`, `reading` and `error` events;
  starting a sensor the machine lacks fires `error` with a `NotReadableError`
- A kind the machine lacks gets no class, so `"Accelerometer" in globalThis`
  tells; the permissions `accelerometer`, `gyroscope`, `magnetometer` and
  `ambient-light-sensor` are `granted` where the sensor exists and `denied`
  where not
- Extras: `Barometer` (`pressure` in hectopascals), `Altimeter` (`altitude`,
  the change in meters), `Compass` (`headingMagneticNorth`,
  `headingTrueNorth`, `accuracy`), and `accuracy` and `yawAccuracy` on the
  magnetometer and orientation sensors
- The proximity sensor needs a device id and a trigger, so it has no class here
- `SensorKind` names the nine sensors, `windowsSensorBackend` is the real
  `SensorBackend` (it takes the WinRT sensors, so a test checks the unit
  conversions) and `SensorErrorEvent` is the `error` event

#### Screen (`winui-svelte/web-apis/screen`)

`installScreen({ backend })` defines `screen`, `devicePixelRatio`,
`getScreenDetails()` and the `Screen`, `ScreenOrientation`, `ScreenDetails`
and `ScreenDetailed` classes over `DisplayArea` and the system DPI

- Sizes are CSS pixels: device pixels over the system scale
  (`devicePixelRatio`); `width`, `height`, `availWidth`, `availHeight`,
  `colorDepth` (24), `isExtended`
- `screen.orientation` is portrait or landscape from the primary display's
  shape with angle 0, fires `change`, and `lock()` rejects `NotSupportedError`
- `getScreenDetails()` resolves a `ScreenDetails` with `screens` (position,
  size, work area, `isPrimary`, `devicePixelRatio`, `label`), `currentScreen`
  (the primary display: the window's own display is not tracked) and
  `screenschange` and `currentscreenchange`; the permission `window-management`
  is always `granted`
- Extras: `displayId` on each screen and `monitors` on the details (name,
  native resolution, physical size, DPI and maximum brightness from EDID)
- `DisplayInformation` (refresh rate, HDR, rotation) needs a view that an
  unpackaged WinUI app lacks, so those stay out; the display areas need the
  Windows App SDK to be running, which a window does
- `windowsScreenBackend` is the real `ScreenBackend`; `OrientationType` is
  `landscape-primary` or `portrait-primary`

### Data and storage (clipboard, share, file system, storage, web storage)

Each is `install<Name>()` from its own subpath and takes an optional `backend`
(or `file`) so a test needs no WinRT

- `winui-svelte/web-apis/clipboard`: `installClipboard()` defines
  `navigator.clipboard` (`read`, `write`, `readText`, `writeText`,
  `onclipboardchange` and the `clipboardchange` event), the global
  `ClipboardItem` (text, HTML, URL list, images, and `web ` custom types) and
  the always granted `clipboard-read` and `clipboard-write` permissions
  More than one item, or a type the clipboard cannot take, rejects with
  `NotAllowedError`
  A type whose value is a promise (`new ClipboardItem({ "text/html": promise })`)
  is delayed-rendered: `write` resolves at once and the promise is awaited
  when something pastes
  Extras: `readContent({ formats })` (copied files in `files`, custom formats
  as text), `writeContent({ files, custom, bitmap, deferred, shouldPersist })`,
  `formats()` and `history()` (Win+V, empty when history is off)
  `windowsClipboardBackend()` is the real backend, for a test to wrap
- `winui-svelte/web-apis/share`: `installShare()` defines `navigator.share`
  and `navigator.canShare` over the share pane
  An app without a package identity rejects with `NotAllowedError` unless
  `installShare({ window })` gives the window to open the pane from; `File`
  objects are copied to a temporary folder first
  Extras on `ShareData`: `description`, `html`, `bitmap`, `custom`,
  `nativeFiles`
  `Sharer` is the object behind the two functions and `windowsShareBackend()`
  the real pane
- `winui-svelte/web-apis/file-system`: `installFileSystem({ owner })` defines
  `showOpenFilePicker`, `showSaveFilePicker`, `showDirectoryPicker` and the
  `FileSystemHandle`, `FileSystemFileHandle`, `FileSystemDirectoryHandle` and
  `FileSystemWritableFileStream` classes
  The handles read and write real files; a writable stream writes a swap file
  and renames it over the target on `close`, so `abort` leaves the file as it
  was
  `owner` gives the window or control the dialogs open over
  `queryPermission` and `requestPermission` always answer `granted`
  Extras: `path` on every handle, `getNativeFile()`, and on the pickers
  `title`, `commitButtonText`, `suggestedStartLocation`, `startFolder`,
  `shouldPromptOverwrite` and `defaultFileExtension`; `viewMode` and the labels
  of `types` are not passed to the dialog
  `FileSystemPickers` holds the three pickers, `windowsPickerBackend(owner)` is
  the real dialogs and `directoryHandleAt(path)` makes a handle for a folder
  the app trusts
- `winui-svelte/web-apis/storage`: `installStorage({ appName })` defines
  `navigator.storage` (`estimate`, `persist`, `persisted`, `getDirectory`) and
  the `persistent-storage` permission
  The origin private file system is `%LOCALAPPDATA%\<app>\origin-private-file-system`
  (Windows redirects it for a packaged app)
  Extra: `getDirectory({ location })` with `roaming` or `temporary`
  `StorageManager` is the class behind `navigator.storage`
- `winui-svelte/web-apis/web-storage`: `installWebStorage({ appName })`
  defines `localStorage`, `sessionStorage`, `Storage` and `StorageEvent`
  `localStorage` is loaded once from `local-storage.json` in the app data
  folder and answered from memory, so every call is synchronous; changes are
  written together 200 milliseconds after the last one (at most 2 seconds
  later), to a sibling file renamed over the old one, and again on exit and on
  uninstall
  `atomicFile(path)` is the default file and `defaultSchedule` the default
  timer (the window thread's dispatcher, or Node's timers elsewhere)
  The quota is 5 MiB of characters (`QuotaExceededError`)
  Extras: `location: "roaming"`, `shouldNotifySelf` to fire `storage` for
  changes made here

### Page, timing, observers and animations

Four subpaths, each with its own `install<Name>()`; none is defined until it is
called (`runWindow({ webApis: [installPage, installTiming] })`)

#### Page (`winui-svelte/web-apis/page`)

`installPage()` defines the page on the global scope, following the window
that `usePageWindow(handle)` is given (`bind:handle` on `<Window>`)

- `document.visibilityState`, `hidden`, `hasFocus()` and `visibilitychange`:
  hidden means minimized, hidden (to the tray) or the display turned off; the
  window being active is focus
- `document` `freeze` and `resume` (Page Lifecycle, with `onfreeze` and
  `onresume`): once per wake of the machine from sleep, `freeze` then
  `resume` together, because a sleeping process cannot see itself go to sleep;
  the wake is found by a gap of over ten seconds between two ticks of a
  one-second timer, so it is also counted after a long stall of the process;
  never exercised with a real sleep here (the tests use a stand-in clock)
- The display and the wake come from `windowsSystemPowerSource` (see Devices,
  power); a machine where it cannot be read counts as awake with the display on
- `window` `focus`, `blur`, `beforeunload` (call `preventDefault()` to keep the
  window open; there is no prompt), `pagehide` and `unload`, with `onfocus` and
  the other handler properties; `window.close()`, `window.closed` and
  `window.open(url)`, which hands the address to Windows and returns `null`
- The Fullscreen API: `element.requestFullscreen()`,
  `document.exitFullscreen()`, `fullscreenElement`, `fullscreenEnabled`,
  `fullscreenchange` and `fullscreenerror`; the whole window goes fullscreen
  (`FullScreenPresenter`), whichever element asked
- `document.title` reads and sets the window's title
- Extras (WinUI only): `document.windowState` (a `WindowState`: `normal`,
  `minimized`, `maximized`, `fullscreen` or `compact-overlay`) and
  `document.requestWindowState(state)`, which reaches the compact overlay
  (Windows' picture in picture); the types merge into `Document` where this
  module is imported
- An app that installs this before its first component mounts keeps it: the DOM
  shim puts the `document` it makes in front of the one there is
- `installPage({ backend })` takes a stand-in window for a test; the real one,
  `WindowPageBackend`, follows a `PageWindow` (the part of a `WindowHandle` it
  uses)

#### Timing (`winui-svelte/web-apis/timing`)

`installTiming({ clock })` defines `requestAnimationFrame`,
`cancelAnimationFrame`, `requestIdleCallback` and `cancelIdleCallback`; a frame
is a tick of the UI thread's dispatcher timer (about 16 milliseconds), a
callback runs once on the next tick, and an idle callback runs after the frame
callbacks with the web's `IdleDeadline` (`timeRemaining()`, `didTimeout` and the
`timeout` option); with the element animations on, `requestAnimationFrame` is
that engine's own on the same timer

#### Observers (`winui-svelte/web-apis/observers`)

`installObservers()` defines `ResizeObserver`, `IntersectionObserver` and
`MutationObserver` over the tree's elements (what `bind:this` and `@attach`
give) or a control; entries arrive after the current event, on the dispatcher

- `ResizeObserver`: the control's `SizeChanged`; the `box` option
  (`ResizeObserverBox`) `content-box` and `border-box` are both `ActualWidth` by
  `ActualHeight`, `device-pixel-content-box` uses the rasterization scale; the
  `ResizeObserverEntry` has the standard sizes, and the extra
  `rasterizationScale`
- `IntersectionObserver`: against the window, the effective viewport of the
  scrolling ancestors (`EffectiveViewportChanged`) or a `root` element, with
  `rootMargin` (px and %) and `threshold`, reporting `IntersectionObserverEntry`
- `MutationObserver`: children, attributes (with `attributeFilter` and
  `attributeOldValue`) and text of the renderer's tree, with `subtree`; a record's
  `type` is a `MutationRecordType` (`childList`, `attributes`,
  `characterData`); the tree is hooked only while an observer watches
- Not covered: `IntersectionObserver` `delay` and `trackVisibility`

#### Animations (`winui-svelte/web-apis/animations`)

`installAnimations()` turns on the element animation engine and gives the
tree's elements `animate()` and `getAnimations()`, and the global scope
`Animation`, `KeyframeEffect` and `AnimationPlaybackEvent`

- `Animation`: `play`, `pause`, `finish`, `cancel`, `reverse`,
  `updatePlaybackRate`, `currentTime`, `startTime`, `playbackRate`, `playState`,
  `ready`, `finished` (rejects with `AbortError` on cancel), `onfinish`,
  `oncancel` and the `finish` and `cancel` events
- `KeyframeEffect`: `getKeyframes`, `setKeyframes`, `getTiming`,
  `getComputedTiming`, `updateTiming`; keyframes may be a list or
  property-indexed
- Timing: `duration`, `delay`, `endDelay`, `iterations`, `direction`, `easing`
  (keywords, `cubic-bezier()`, `steps()`) and `fill`
- What animates is what the engine reaches (opacity, translation, scale,
  rotation, size, margin, padding, border, shape dashes); the keyframes are
  evenly spaced, so a keyframe `offset` or `easing` is ignored, and anything
  else warns once
- Not covered: `document.getAnimations()`, composite modes and
  pseudo-elements; scroll timelines are `winui-svelte/scroll-timeline`, below
- Extras (WinUI only): `element.prepareConnectedAnimation(key)` and
  `element.startConnectedAnimation(key)` over `ConnectedAnimationService`;
  implicit animations are the CSS `transition:` the translator already maps to
  `OpacityTransition` and its siblings

#### Scroll timelines (`winui-svelte/scroll-timeline`)

`installScrollTimeline()` defines `ScrollTimeline` and `ViewTimeline` on the
global scope and lets `element.animate(keyframes, { timeline })` follow a scroll
position instead of the clock; install `installAnimations()` first for the rest
of the Web Animations API (a call without a timeline goes on to it)
It is not part of `installWebApis`; `"ScrollTimeline" in globalThis` tells
whether it was installed

- `new ScrollTimeline({ source, axis })`: `source` is a `<scroll-viewer>`
  element, `axis` is `block` (the default), `inline`, `x` or `y`;
  `currentTime` is `{ value, unit: "percent" }` of the scrollable range, or
  `null` while the source is no scroll viewer in a window, and `duration` is 100
  percent
- `new ViewTimeline({ subject, axis, inset })`: `currentTime` is how far the
  subject has crossed the nearest scroll viewer, from entering (0) to leaving
  (100); `inset` is `"10px"` or `["10px", "20%"]`
- `element.animate(keyframes, { timeline, rangeStart, rangeEnd, direction })`
  returns a `ScrollLinkedAnimation` with `timeline`, `playState`
  (`running` or `idle`) and `cancel()`; `rangeStart` and `rangeEnd` are the
  CSS `animation-range` words (`"entry 10%"`, `"25%"`)
- The same rules as the CSS: the keyframes go through the CSS build's reader,
  so opacity, translate, scale, rotate and a transform of them work, and a
  width, a color, a keyword or a skew is a `NotSupportedError`, as is an easing
  other than `linear` and an iteration count other than 1; a keyframe `offset`
  is honoured, the rest are evenly spaced
- Under reduced motion (Windows' animation effects off, or the
  `isMotionReduced` option) the animation does not start and `playState` is
  `idle`; an element with the class `winui-motion-always` keeps it
- The compositor runs the animation, so the UI thread cannot read its value
  back: `Visual.Opacity` stays at its resting value (the pixels are what shows)
- Not covered: `getAnimations()` for these, `pause()`, `play()` and
  `currentTime` of the animation, and `timeline-scope`

#### View transitions (`winui-svelte/view-transitions`)

`installViewTransitions()` defines `document.startViewTransition` and
`ViewTransition` over WinUI's connected animations
An element takes part through `view-transition-name` in a sheet or a style
attribute (`winui-svelte/css/view-transition`, see `src/css/API.md`): before
the update runs, each named element is prepared under its name
(`ConnectedAnimationService.PrepareToAnimate`); after it, the element with the
same name starts that animation (`TryStart`), and WinUI flies a picture of the
old element to the new one

```svelte
<script lang="ts">
  import { installViewTransitions } from "winui-svelte/view-transitions";

  installViewTransitions();
  let selected = $state<Photo | null>(null);

  function open(photo: Photo) {
    document.startViewTransition(() => {
      selected = photo;
    });
  }
</script>

{#if selected}
  <border class="hero" style="view-transition-name: photo-{selected.id}" />
{:else}
  {#each photos as photo (photo.id)}
    <border style="view-transition-name: photo-{photo.id}" />
  {/each}
{/if}
```

- `startViewTransition(update)` or `startViewTransition({ update, types })`
  returns a `ViewTransition` with `updateCallbackDone`, `ready`, `finished`,
  `types` and `skipTransition()`; the update may return a promise, and runs in
  a microtask after the old elements are prepared
- After the update the transition waits one turn of the event loop for Svelte
  to apply it, then pairs the names; `ready` resolves once the animations
  start, `finished` once WinUI reports each one completed
- Like the web: a name two elements share skips the transition (`ready`
  rejects with an `InvalidStateError`), `skipTransition()` rejects `ready`
  with an `AbortError` and lets `finished` follow the update, an update that
  throws rejects all three promises with its error, and a new transition skips
  the one still running
- Extras (WinUI only): `configuration` in the options object picks the
  motion, a `ConnectedAnimationKind` from `winui-svelte/enums`: `gravity`
  (WinUI's default, for going forward), `direct` (for going back) or `basic`
- Limits: only a name both states have moves; a name only the old state has
  gets no exit and one only the new state has no entrance (the web would fade
  them), and there is no cross-fade of the whole window (the web's `root`)
  An element that keeps its name and stays in the tree does not move: WinUI
  will not animate an element to itself (`implicitLayoutAnimation` slides
  children the layout moves)
  The duration and easing are WinUI's (`ConnectedAnimationService`), not CSS;
  the `::view-transition-*` pseudo-elements, `view-transition-class` and
  `:active-view-transition-type()` have no counterpart, and `types` is carried
  but read by nothing

#### Dialogs (`winui-svelte/dialogs`)

`installDialogs()` defines `alert`, `confirm` and `prompt` on the global scope
over WinUI's `ContentDialog`

```svelte
<script lang="ts">
  import { installDialogs, useDialogWindow } from "winui-svelte/dialogs";
  import type { WindowHandle } from "winui-svelte/components";

  installDialogs();
  let handle = $state<WindowHandle>();

  $effect(() => {
    if (!handle) {
      return;
    }

    return useDialogWindow(handle);
  });

  async function remove() {
    const isSure = await confirm("Delete this file?");
    if (isSure) {
      await alert("Deleted");
    }
  }
</script>
```

- Decision: they return promises, where the browser's block, because a
  `ContentDialog` is asynchronous and the thread that would block is the one
  that pumps the window, so a blocking version would freeze the dialog it
  waits for; the web names are kept, so that a library written for a browser still calls them,
  and the result is awaited: `await confirm(text)`. The other way (new names
  and no globals) would make every such library need a patch; the cost of this
  way is that `if (confirm(text))` is always true, because a promise is
  truthy, and `lib.dom` still types the globals as synchronous; in your own
  code call `showAlert`, `showConfirm` and `showPrompt` (the same functions,
  typed as promises) and leave the globals to libraries
- `alert(message)` resolves when the dialog closes, `confirm(message)`
  resolves `true` for OK, `prompt(message, default)` resolves with the text or
  `null` for Cancel, Escape or the close button; a message that is not a
  string is shown as `String(message)`
- `showDialog({ content, title, primaryButtonText, secondaryButtonText,
  closeButtonText, defaultButton, input, signal })` is the WinUI form: three
  buttons, the button Enter presses (`DialogButton`), a text box
  (`{ value, placeholder, isMultiline }`) and an `AbortSignal` that closes the
  dialog like Escape; it resolves with `{ result, text }`, where `result` is a
  `DialogResult` (`primary`, `secondary` or `none`) and `text` is the box when
  the primary button closed a dialog that had one
- Which window: `useDialogWindow(handle)` takes the handle `bind:handle`
  gives, for each window; the dialog opens in the one activated last, and the
  function it returns stops following the window
- One at a time: WinUI shows one `ContentDialog` per window, so a dialog asked
  for while another is open waits, in order, in the same line the
  `ContentDialog` components use; a dialog that fails does not hold the line,
  and an aborted one that still waits is rejected with an `AbortError`
- No window: `alert` and `confirm` show a message box (`showNotice`, with the
  installed `title`), and `prompt` and `showDialog` reject with an
  `InvalidStateError`, because a message box has no text box and no third
  button
- `installDialogs({ title, okText, cancelText })` sets the title and the
  button texts (English by default; WinUI does not translate them)
- Not covered: a dialog that blocks the caller, and the prompt of
  `beforeunload`

### Media devices (`winui-svelte/web-apis/media-devices`)

`installMediaDevices()` defines `navigator.mediaDevices` (`enumerateDevices`,
`getUserMedia`, `getDisplayMedia`, `getSupportedConstraints`, `devicechange`),
`MediaStream`, `MediaStreamTrack`, `MediaDeviceInfo` and
`OverconstrainedError` over `DeviceInformation` and `MediaCapture`, and answers
the Permissions API's `camera` and `microphone` from the Windows privacy
switches (`DeviceAccessInformation`); `installMediaRecorder()` defines
`MediaRecorder` and `BlobEvent`

- The classes are `MediaDevices`, `MediaStream`, `MediaStreamTrack`,
  `MediaDeviceInfo`, `OverconstrainedError`, `MediaRecorder`, `BlobEvent` and
  `MediaRecorderErrorEvent`; `CAMERA_AXES` lists the names of a camera's axes
- `enumerateDevices()` lists inputs and outputs; until the camera or
  microphone may be used it lists one blank entry per kind, as browsers do
- `getUserMedia({ audio, video })` opens one `MediaCapture` for the camera and
  the microphone together; `width`, `height`, `frameRate`, `deviceId` and
  `facingMode` (the camera's panel) choose the device and the format, the
  formats being read from the camera's capture profiles (a camera without
  profiles offers 640 by 480 at 30); an `exact` that nothing meets is an
  `OverconstrainedError` naming the constraint
- Errors are the spec's: `TypeError` for no audio and no video,
  `NotAllowedError` for a privacy switch that is off, `NotFoundError` for no
  such device, `NotReadableError` for a device another app holds
- `track.applyConstraints()` changes the camera's format; stopping the last
  track of a capture releases the device; a device that fails ends its tracks
  with `ended`
- `getDisplayMedia()` shows the Windows picker (`GraphicsCapturePicker`); a
  canceled picker is `NotAllowedError`; the stream carries the chosen surface
  and its size, and no frames yet
- `MediaRecorder` records a `getUserMedia` stream into MP4 (H.264 and AAC), M4A,
  MP3 or WAV in memory; the recording arrives as one `dataavailable` when it
  stops, and `timeslice` and `requestData` do not cut it earlier
- Extras (WinUI-only, optional): `getUserMedia({ sharingMode: "exclusive" })`,
  `video: { profileId }` (a capture profile), `stream.mediaCapture` (the
  `MediaCapture` underneath), `track.camera` with `zoom`, `exposure`, `focus`,
  `whiteBalance`, `brightness`, `contrast`, `hue`, `backlightCompensation`,
  `pan`, `tilt` and `roll`, each with `isSupported`, `min`, `max`, `step`,
  `value`, `isAuto`, `setValue()` and `setAuto()`, `track.captureItem` (the
  `GraphicsCaptureItem` of a screen), `getDisplayMedia({ cursor })`,
  `MediaDeviceInfo.isDefault` and `panel`, and `videoQuality` in the options of
  `new MediaRecorder`
- Windows raises `MediaCapture` events on a thread of its own; where the
  bindings do not deliver one, a track does not hear that its device went away
- Tests give `installMediaDevices({ backend })` and
  `installMediaRecorder({ backend })` a stand-in, so they need no camera

### Speech (`winui-svelte/web-apis/speech`)

`installSpeechSynthesis()` defines `speechSynthesis`,
`SpeechSynthesisUtterance`, `SpeechSynthesisVoice` and the event classes over
`SpeechSynthesizer`; `installSpeechRecognition()` defines `SpeechRecognition`
and `webkitSpeechRecognition` over `SpeechRecognizer`; `installSpeech()`
installs both

- The classes are `SpeechSynthesis`, `SpeechSynthesisUtterance`,
  `SpeechSynthesisVoice`, `SpeechSynthesisEvent`, `SpeechSynthesisErrorEvent`
  (with `SpeechSynthesisErrorCode`), `SpeechRecognition`,
  `SpeechRecognitionEvent`, `SpeechRecognitionErrorEvent` (with
  `SpeechRecognitionErrorCode`), `SpeechRecognitionResultList`,
  `SpeechRecognitionResult`, `SpeechRecognitionAlternative` and
  `SpeechGrammarList`
- `speechSynthesis.speak()` queues; each utterance is synthesized into a
  `SpeechSynthesisStream` and played by a `MediaPlayer`; `cancel()`, `pause()`,
  `resume()`, `getVoices()`, `speaking`, `pending`, `paused` and `voiceschanged`
  are the spec's; `rate`, `pitch` and `volume` map to `speakingRate`,
  `audioPitch` and `audioVolume`
- `start`, `end`, `pause`, `resume`, `error` and `boundary` events fire in the
  spec's order; `boundary` carries `charIndex`, `charLength` and `name`
  (`word` or `sentence`) from the stream's `SpeechWord` and `SpeechSentence`
  tracks, the nth cue being the nth word or sentence of the text
- `SpeechRecognition` takes `lang`, `continuous`, `interimResults` and
  `maxAlternatives`, and fires `start`, `audiostart`, `soundstart`,
  `speechstart`, `result`, `nomatch`, `speechend`, `soundend`, `audioend`,
  `error` and `end`; a phrase uses `recognizeAsync`, `continuous` uses a
  continuous session; the errors are the spec's, from the recognition status
  (`audio-capture` for no microphone, `network`, `language-not-supported`,
  `bad-grammar`, `no-speech`, `service-not-allowed` when the online speech
  recognition privacy setting is off, `not-allowed` for a denied microphone)
- Extras (WinUI-only, optional): `utterance.isSsml`,
  `utterance.punctuationSilence` and `utterance.appendedSilence` (`default` or
  `minimal`), `voice.gender` and `voice.description`,
  `recognition.scenario` (`dictation`, `web-search`, `form-filling`) and
  `recognition.phrases` (a list the speech must be one of), and
  `renderSpeech(request)`, which synthesizes without playing and returns the
  boundaries with their times, the media type and the size
- `SpeechCue` is not bound, so an SSML `<bookmark>` raises `mark` only for a
  voice that reports it, and the installed Microsoft voices do not
- Recognition events and the hypotheses of `interimResults` are raised by
  `SpeechRecognizer` on a thread of its own; where the bindings do not deliver
  them, only the single phrase is complete

### Media session (`winui-svelte/web-apis/media-session`)

`installMediaSession({ player })` defines `navigator.mediaSession`,
`MediaSession` and `MediaMetadata` over the `SystemMediaTransportControls` of a
`MediaPlayer` (pass the one `createMediaPlayer` made, or let the session own a
silent one)

- `MediaSessionAction` names the actions the overlay can raise
- `metadata` (also when its fields change later), `playbackState`,
  `setActionHandler()` and `setPositionState()` work as the spec says; a
  handler enables the matching overlay button: `play`, `pause`, `stop`,
  `previoustrack`, `nexttrack`, `seekbackward`, `seekforward` and `seekto`;
  other standard actions are accepted and have no button
- Extras (WinUI-only, optional): `mediaType`, `albumArtist`, `trackNumber`,
  `albumTrackCount`, `genres` and `subtitle` in the init of `new MediaMetadata`,
  and on the session `isShuffleEnabled` and `autoRepeatMode` (set them, then
  call `update()`) with the `shufflechange` and `repeatchange` events for the
  overlay's buttons
- The overlay's events are raised on a thread of its own; where the bindings do
  not deliver them, the overlay shows the state and its buttons do not reach
  the page

### Hardware access (`winui-svelte/web-apis/bluetooth`, `usb`, `hid`, `serial`, `wake-lock`, `idle`)

Each is `install<Name>()` with a `backend` option the tests replace, and each
lists devices without opening them; the real-device tests only list and read

#### The chooser

A browser shows a dialog in `requestDevice` and `requestPort`; this package
shows none, so the app gives the picker, once at install or on one call:

```ts
installUsb({
  chooser: async ({ candidates, signal }) => [await showMyPickerDialog(candidates)]
});

const device = await navigator.usb.requestDevice({ filters: [{ vendorId: 0x1234 }] });
```

- A chooser gets the candidates that passed the filters and answers with the
  ones the user wants (HID may take several, the others take the first); an
  empty answer is `NotFoundError`, and without a chooser the request is
  `NotAllowedError`
- What the user picked is allowed for this run: `getDevices()` and `getPorts()`
  list the allowed devices that are plugged in, and `forget()` takes one back
- `connect` and `disconnect` fire for allowed devices only, from a device
  watcher that starts with the first listener
- Every candidate is the backend's own record (`BluetoothCandidate`,
  `UsbDeviceInfo`, `HidDeviceInfo`, `SerialPortInfo`), so a dialog can show
  names, ids and signal strength

#### Bluetooth

`installBluetooth({ chooser, backend })` defines `navigator.bluetooth` and
`BluetoothUUID` over `src/devices/bluetooth`, and answers the `bluetooth`
permission (`prompt` until a device is picked)

- `requestDevice` scans for 5 seconds, filters by `services`, `name`,
  `namePrefix` and `manufacturerData` (with `exclusionFilters` and
  `acceptAllDevices`), then asks the chooser; the options rules of the spec
  throw `TypeError`
- `BluetoothDevice` has `gatt`, `watchAdvertisements({ signal })` with
  `advertisementreceived` (`BluetoothAdvertisingEvent`), `forget()` and
  `gattserverdisconnected`; the same object comes back for the same device
- `gatt.connect()` shares one attempt; services outside `filters` and
  `optionalServices` are `SecurityError`, absent ones `NotFoundError`, a
  closed link `NetworkError`
- Characteristics read, write (with or without response), notify
  (`characteristicvaluechanged` on the characteristic, its service and the
  device) and list descriptors; `value` is a `DataView`
- Names such as `battery_service` are not resolved: use the number
  (`0x180F`), the 4 or 8 digit hex or the full UUID
- Not built: `availabilitychanged`, `serviceData` filters, `appearance`
- Extras: `requestDevice({ chooser, scanMilliseconds, signal })`,
  `BluetoothDevice.address`, `BluetoothValueChangedEvent.characteristic`

#### USB

`installUsb({ chooser, backend })` defines `navigator.usb` over
`Windows.Devices.Usb`; only devices with the WinUSB driver exist for it

- `requestDevice({ filters })` (an empty list matches every device) and
  `getDevices()`; `USBDevice` has `open`, `close`, `forget`,
  `selectConfiguration`, `claimInterface`, `releaseInterface`,
  `selectAlternateInterface`, `controlTransferIn` and `Out`, `transferIn` and
  `Out` (bulk and interrupt endpoints), `clearHalt`, with the state rules of the
  spec (`InvalidStateError` before `open`, `NotFoundError` for an unclaimed
  endpoint)
- Listing reads the device interface only, so `configurations` are filled
  after `open()`; Windows has one configuration per WinUSB device, so
  `selectConfiguration` only accepts it
- `reset()` and isochronous transfers have no WinRT call and reject with
  `NotSupportedError`
- Extras: `requestDevice({ chooser, signal })`, `USBDevice.interfacePath`

#### HID

`installHid({ chooser, backend })` defines `navigator.hid` over
`Windows.Devices.HumanInterfaceDevice`

- `requestDevice({ filters, exclusionFilters })` filters by `vendorId`,
  `productId`, `usagePage` and `usage`, and returns an array
- `HIDDevice.open()` turns on `inputreport` (`HIDInputReportEvent` with
  `reportId` and `data`); `sendReport`, `sendFeatureReport` and
  `receiveFeatureReport` take the report id and the bytes without it
- `collections` holds the top-level collection only: WinRT does not give the
  report descriptor
- Extras: `requestDevice({ chooser, signal })`, `HIDDevice.interfacePath`

#### Serial

`installSerial({ chooser, backend })` defines `navigator.serial` over
`Windows.Devices.SerialCommunication`

- `requestPort({ filters })` filters by `usbVendorId` and `usbProductId`;
  `SerialPort.open({ baudRate, dataBits, stopBits, parity, bufferSize,
  flowControl })` checks its options (`TypeError`) and fails with
  `NetworkError` when the port is busy
- `readable` and `writable` are byte streams; a framing, parity or overrun
  error on the line errors the readable with a `DOMException` of that name and
  a new `readable` takes its place; `close()` needs both streams unlocked
- `getSignals()` and `setSignals({ dataTerminalReady, requestToSend, break })`
  map the control lines (`ringIndicator` is always false: WinRT has none)
- Extras: `requestPort({ chooser, signal })`, `SerialPort.portName`,
  `SerialPort.interfacePath`, `SerialPort.connected`

#### Screen wake lock

`installWakeLock({ visibility })` defines `navigator.wakeLock` and
`WakeLockSentinel` over `DisplayRequest` (one request per sentinel, which
needs a single-threaded apartment: the window thread has one)

- `request("screen")` gives a sentinel with `release()` and `release` event;
  any other type is `TypeError`; the `screen-wake-lock` permission is granted
- A hidden page releases every lock and refuses a new one (`NotAllowedError`);
  by default the page is the page module's `document` (install
  `web-apis/page` first); `visibility` (`isVisible()` and `onChange(callback)`)
  replaces it, and without a document the page counts as always visible
- Extra: `navigator.wakeLock.activeCount`

#### Idle detection

`installIdleDetector({ permission })` defines `IdleDetector` over
`GetLastInputInfo` (user state) and whether the input desktop can be opened
(screen lock), polled once a second

- `IdleDetector.requestPermission()` grants, as Windows asks nothing (pass
  `permission: "denied"` to refuse); `start({ threshold, signal })` needs it
  (`NotAllowedError`), takes a threshold of at least 60000 (`TypeError`) and
  resolves with `userState` (`active` or `idle`) and `screenState` (`locked` or
  `unlocked`) set; `change` fires when either moves
- Extra: `idleMilliseconds`, the time since the last input at the last reading

#### Fonts

`installFontFaces()` defines `FontFace` and `document.fonts` (a `FontFaceSet`)
over the font registry that a stylesheet's `@font-face` also fills, so a font
file of the app is used by its family name in a `font-family` of a style and in
a `fontFamily` prop

- `new FontFace(family, source, descriptors)`: `source` is `url("...")`, a path
  or a `file:` URL (a relative path is relative to the working folder), or the
  bytes of a font (written to a file of the temporary folder named by their
  hash); `load()` registers the file under the family and rejects with
  `NetworkError` when there is no such file; `status` and `loaded` follow
- `document.fonts.add(face)` registers at once; `delete(face)`, `clear()` and
  `has(face)` as on the web; `check(font)` and `load(font)` look at the faces of
  the set that the font shorthand names; `ready` is resolved and `status` is
  `loaded`
- `FontLoadStatus` is the closed set of `status` (`"unloaded"`, `"loading"`,
  `"loaded"`, `"error"`)
- The family must be the name written inside the font file; weight, style,
  width and `unicodeRange` are kept and read back but choose nothing, because
  WinUI takes the face from the file
- WinUI cannot unload a font: after `delete(face)` the family stops being
  spelled as its file, but a font already loaded stays usable by name until the
  process ends
- It works in a plain Node process; nothing is installed on the machine (the
  file is handed to WinUI as `ms-appx:///` and its absolute path)
- Extra: `registerFont({ family, source, base })` and `unregisterFont(family)`
  from `winui-svelte/css`, the registry itself

#### Other exports

- Bluetooth: `BluetoothRemoteGATTServer`, `BluetoothRemoteGATTService`,
  `BluetoothRemoteGATTCharacteristic`, `BluetoothRemoteGATTDescriptor`, and
  what a backend throws: `BluetoothFailure` with a `BluetoothFailureKind`
- USB: `USBInTransferResult`, `USBOutTransferResult`, `USBConnectionEvent`,
  and for a backend `UsbFailure`, `UsbDirection`, `UsbEndpointType`,
  `UsbRecipient`, `UsbRequestType`, `UsbTransferStatus`
- HID: `HIDConnectionEvent`, and `HidFailure` for a backend
- Serial: `SerialConnectionEvent`, and for a backend `SerialFailure`,
  `SerialFlowControlName`, `SerialLineError`, `SerialParityName`
- Wake lock: `WakeLock` (the `navigator.wakeLock` class) and
  `windowsWakeLockBackend`
- Idle: `UserIdleState`, `ScreenIdleState` and `windowsIdleBackend`

### Credentials, eye dropper and contacts

#### Credentials (`winui-svelte/web-apis/credentials`)

`installCredentials({ origin, windowHandle, chooseAccount })` defines
`navigator.credentials` (`get`, `store`, `create`, `preventSilentAccess`) and
the classes `Credential`, `CredentialsContainer`, `PasswordCredential`,
`PublicKeyCredential` and the `AuthenticatorResponse` family
(`AuthenticatorAttestationResponse` for `create`, `AuthenticatorAssertionResponse`
for `get`)

- **Passwords**: `create({ password })` makes a `PasswordCredential`, `store`
  keeps it in the Windows PasswordVault under the origin, `get({ password:
  true })` reads it back; `mediation: "silent"` answers only for exactly one
  account and not after `preventSilentAccess()`; with several accounts
  `chooseAccount(accounts)` is asked, and the first is used without one; the
  name and icon of a `PasswordCredential` are not kept
- **WebAuthn**: `create({ publicKey })` and `get({ publicKey })` use a Windows
  Hello key made with `KeyCredentialManager` (the Hello prompt is shown by
  Windows)
  - Covered: platform credentials, `none` attestation, RS256 (-257) keys,
    discoverable credentials (kept in the PasswordVault, without secrets),
    `excludeCredentials`, `allowCredentials`, `clientDataJSON`,
    `authenticatorData` with flags and signature counter, `getPublicKey()`,
    `getTransports()`, `isUserVerifyingPlatformAuthenticatorAvailable()`
  - Not covered: roaming authenticators and security keys (`webauthn.dll` is
    not used), extensions, other algorithms, attestation formats other than
    `none`, conditional mediation, `FederatedCredential`
  - `rp.id` must be a suffix of the host of `origin` (`https://localhost` by
    default), and the origin must be secure
  - Errors are the spec's: `NotAllowedError` (cancelled, nothing found, Hello
    not set up), `NotSupportedError`, `InvalidStateError`, `SecurityError`,
    `AbortError` from `signal`
- **Extras** (optional, ignored anywhere else): `userVerificationMessage` on
  `create` and `get` asks Windows Hello to verify the user first;
  `PublicKeyCredential.verifyUser(message)` runs that check alone (`verified`,
  `canceled`, `unavailable`, `busy`, `retries-exhausted`);
  `PublicKeyCredential.deleteCredential({ id, rpId })` removes a credential and
  its Hello key
- `CredentialsBackend` (the vault and the key store) is the one interface the
  real Windows backend and the tests implement

#### EyeDropper (`winui-svelte/web-apis/eye-dropper`)

`installEyeDropper()` defines `EyeDropper`; `await new EyeDropper().open({
signal })` resolves with `{ sRGBHex }` for the pixel under the next left click
anywhere on the screen

- Escape or the user cancelling rejects with `AbortError`, as does `signal`; a
  second `open` while one waits is an `InvalidStateError`
- The click is not swallowed: it reaches the window under the cursor; there is
  no magnifier
- Extra: the result also has `position` (`x`, `y` in screen pixels)
- `ScreenPicker` is the one interface the polling picker (`windowsScreenPicker`)
  and the tests implement

#### Images (`winui-svelte/web-apis/images`)

`installImageCodecs()` defines `createImageBitmap`, `ImageBitmap` and
`ImageDecoder`, and adds `toBlob`, `convertToBlob` and `toDataURL` to
`CanvasElement`; all of it runs on `Windows.Graphics.Imaging`, which needs no
window and no package identity

- `createImageBitmap(source, options?)` and `createImageBitmap(source, sx, sy,
  sw, sh, options?)` take a `Blob`, `File` or `NativeFile` of an image file,
  `ImageData`, an `ImageBitmap` or a canvas; `imageOrientation` (`from-image`,
  `none`, `flipY`), `resizeWidth`, `resizeHeight` and `resizeQuality` work;
  `premultiplyAlpha` and `colorSpaceConversion` are read and ignored (images are
  color managed to sRGB); a file Windows cannot decode rejects with
  `InvalidStateError`
- `ImageBitmap` has `width`, `height` and `close()`; `drawImage` and
  `createPattern` take it; extra: `toImageData()` (RGBA, not premultiplied)
- `new ImageDecoder({ data, type })` takes bytes or a stream; `tracks` (an
  `ImageTrackList` of one `ImageTrack`), `complete`, `completed`, `decode({ frameIndex })`, `reset()`,
  `close()` and `ImageDecoder.isTypeSupported(type)`; `image` is an
  `ImageBitmap`, not a `VideoFrame`, and `duration` is not reported; a GIF
  frame is what the file stores, so an optimized GIF gives the changed area
- Decoders: BMP, GIF, ICO, JPEG, PNG, TIFF, JPEG XR, and WebP, AVIF and HEIC
  where Windows has the codec; `isTypeSupported` asks Windows' own list
- Encoders: PNG, JPEG (`quality` 0 to 1 is `ImageQuality`, 0.92 by default;
  transparency is drawn over black), GIF, BMP and TIFF; WebP has no Windows
  encoder, so `toBlob`, `convertToBlob` and `toDataURLAsync` give a PNG for
  `image/webp` and for any type Windows cannot write, as the platform does
- `toDataURL(type, quality)` is synchronous and every Windows encoder is
  asynchronous, so it always returns a PNG; extra: `toDataURLAsync(type,
  quality)` encodes any type above
- A canvas with no pixels gives `data:,`, `null` from `toBlob` and rejects
  `convertToBlob`
- `ImageCodec` is the one interface the Windows codec (`windowsImageCodec`)
  and the tests implement; `ImageMimeType`, `ImageOrientation` and
  `ResizeQuality` are in `winui-svelte/enums`

#### Contacts (`winui-svelte/web-apis/contacts`)

`installContacts()` defines `navigator.contacts` (a `ContactsManager`) with
`getProperties()` and `select(properties, { multiple })`; `ContactProperty` names
the five properties

- Resolves with one object per contact holding only the requested properties,
  each a list (`name`, `email`, `tel`, `address`); a cancelled picker gives an
  empty list; no or an unknown property is a `TypeError`; a second `select`
  while one is open is an `InvalidStateError`
- Backed by the Windows `ContactPicker`, a user interface that needs a window
  and, for most apps, package identity; where Windows refuses, `select` rejects
  with `NotSupportedError`; `icon` returns an empty list
- Extra: `commitButtonText` in the options
- `ContactChooser` is the one interface the real picker (`windowsContactChooser`)
  and the tests implement

## Accessibility (`winui-svelte/accessibility`)

Tell a screen reader what happened, and check the window for what it would
trip on; each is opt-in, and the audit is for development only

```svelte
<script lang="ts">
  import { announce, LivePriority, liveRegion } from "winui-svelte/accessibility";
  import { elementRef } from "winui-svelte";
  import { TextBlock } from "winui-svelte/components";

  const status = elementRef<TextBlock>();
</script>

<!-- a live region: a change of its text is spoken -->
<TextBlock {@attach liveRegion({ priority: LivePriority.POLITE })} {@attach status.attach}>{saved}</TextBlock>
```

```ts
announce({ message: "Saved", element: status.current, priority: LivePriority.POLITE });
```

| Web API | Here |
|---|---|
| `aria-live="polite"` and `role="status"` | `LivePriority.POLITE`: waits for the user, a newer message replaces an older one |
| `aria-live="assertive"` and `role="alert"` | `LivePriority.ASSERTIVE`: interrupts |
| `aria-live="off"` | `LivePriority.OFF`: says nothing |
| writing text into a live region | `announce({ message, element, priority })`: `AutomationPeer.RaiseNotificationEvent` (kind Other; polite is `MostRecent`, assertive is `ImportantMostRecent`) |
| the `aria-live` attribute | `liveRegion({ priority })`: `AutomationProperties.LiveSetting` of the element |

- `FormField` marks its error text with the same `liveRegion`, so a form error
  is spoken when it appears
- `announce` raises the notification from `element`, or from the nearest
  element above it that has an automation peer (a layout panel has none; a
  `TextBlock` does), so keep a small status element for it
- `LivePriority` is also in `winui-svelte/enums`

### Audit (`winui-svelte/accessibility/audit`)

`auditAccessibility(root)` walks the visual tree of a laid-out window and returns
typed findings; call it from `onloaded` or a button in development, and never
import the entry in a production build

```ts
import { auditAccessibility } from "winui-svelte/accessibility/audit";

for (const finding of auditAccessibility(content)) {
  console.warn(`${finding.path}: ${finding.message} - ${finding.suggestion}`);
}
```

| Rule id | Applies to | Finds |
|---|---|---|
| `unnamed-button` | buttons | no accessible name (an icon-only button with no `automationName`) |
| `unlabeled-input` | text boxes, combo boxes, sliders, check boxes | no name, header or `automationLabeledBy` |
| `duplicate-access-key` | interactive controls | the same `accessKey` on two elements |
| `zero-size-focusable` | interactive controls | takes focus but has no width or height |
| `unreachable-by-keyboard` | interactive controls | not a tab stop and no access key or keyboard accelerator |
| `low-contrast-text` | text, buttons, inputs | below WCAG AA (4.5 to 1, 3 to 1 for large text) on a solid background the tree can resolve |

- The name is what UI Automation computes (`AutomationPeer.GetName`), so it
  counts `automationName`, a button's text, a header and a label alike
- Contrast is measured only where the foreground is a solid brush and a solid
  background lies behind the text (a translucent one is mixed with it);
  gradients, acrylic and images are left alone
- The rules are one table, `accessibilityRules`; `ruleDescriptions()` is the
  table without its predicates, and `winui-svelte/accessibility/rules.json`
  is the same as JSON for an editor (`pnpm gen:accessibility-rules`, checked by
  `pnpm gen:accessibility-rules:check` in the lint gate)
- `auditTree({ root, host })` runs the rules over any tree a host describes,
  which is how the unit tests run them without WinUI
- `examples/accessibility` holds a failing and a fixed form;
  `test/accessibility.test.ts` audits it in a real window and hears
  `announce` through a UI Automation event handler, and the gallery page
  "Live regions and the audit" shows both

## Forms (`winui-svelte/forms`)

Opt-in: nothing in the core imports it, so an app that does not use it does
not bundle it

```ts
// A panel (StackPanel props) that is a form. Generic over the zod schema:
// onsubmit's data is z.output<Schema>, or FormObject without a schema.
<Form schema? noValidate? onsubmit? action? oninvalid? onreset? oncancel? onerror? bind:handle />

interface FormSubmission<Data> {
  data: Data;                       // the schema's output, else the entries as an object
  formData: FormValues;             // the entries in field order, repeated names kept
  event: { submitter: ButtonBinding | null };
  signal: AbortSignal;              // aborted when the form is reset while the action runs
}

interface FormHandle {
  readonly isPending: boolean;      // an async action runs (reactive)
  readonly isSubmitted: boolean;    // a submit was tried since the form was made or reset
  readonly isValid: boolean;
  readonly fields: readonly FieldState[];
  field(name: string): FieldState | undefined;
  values(): FormValues;
  requestSubmit(options?: { submitter?: ButtonBinding | null }): Promise<boolean>;
  submit(): Promise<void>;          // no validation, no oninvalid
  reset(): void;
  checkValidity(): boolean;         // shows nothing
  reportValidity(): boolean;        // shows the errors, focuses the first invalid field
}

class FieldState {                  // handle.field(name), all reactive
  name; value; validity: ValidityState; message: string;
  isTouched; isDirty; isRequired; isValid; isUserInvalid;
  setCustomValidity(message: string): void;   // "" clears it
  checkValidity(): boolean; reportValidity(): boolean; focus(): boolean;
}
```

A control joins with an attachment (`{@attach textField({ name: "email" })}`),
which reads the control's own property and change event, so `bind:` still
works:

| Attachment | Controls | Value |
| --- | --- | --- |
| `textField` | TextBox, AutoSuggestBox | `string` |
| `passwordField` | PasswordBox | `string` |
| `numberField` | NumberBox | `number`, `null` when empty |
| `sliderField` | Slider | `number` |
| `ratingField` | RatingControl | `number`, `null` for none |
| `checkField` | CheckBox, ToggleButton | `boolean` |
| `switchField` | ToggleSwitch | `boolean` |
| `selectField` | ComboBox, RadioButtons | the item when text, number or boolean, else its index; `values` or `itemValue` say what it stands for |
| `dateField` | DatePicker, CalendarDatePicker | `Date`, `null` for none |
| `timeField` | TimePicker | `"HH:mm"` |
| `colorField` | ColorPicker | `"#rrggbb"` |

```ts
interface FieldOptions extends Constraints {
  name: string;
  form?: FormHandle;                // a field outside the Form's subtree
  messages?: Partial<Record<ValidityFlag, string>>;
  label?: string;                   // the accessible name (UI Automation Name)
  checkedValue?: FieldValue;        // check box or switch: collected as this when checked, left out when not
  isErrorShown?: boolean;           // red border and help text on the control (default true)
}
interface Constraints {
  required?; minLength?; maxLength?; min?: number | Date; max?: number | Date;
  step?; pattern?: RegExp | string  /* a string is anchored, as HTML's */; type?: InputType;
}
// formButton({ kind?: ButtonKind.SUBMIT | RESET | BUTTON, form? }): on any control with onclick
```

- The check order of the message is custom error, value missing, bad input,
  type mismatch, pattern, too short, too long, range, step; `DEFAULT_MESSAGES`
  has the defaults and `messages` replaces them per field
- `FormValues` is `FormData`-like: `append`, `set`, `get`, `getAll`, `has`,
  `delete`, `keys`, `values`, `entries`, iteration, `toObject()` (an array for a
  repeated name) and `toFormData()` (a web `FormData` of text for `fetch`)
- A field disabled when the form is read is left out, as in HTML
- `FormField` props: its panel's, `label`, `description`, `field` (the name whose
  error it shows), `error` (an error of the app's own), `isRequired`
### How a form behaves

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

- Pure parts (`validityOf`, `FormValues`, the adapters) run in plain Node; the
  attachments need WinUI; `test/forms.test.ts` runs `examples/form` in a real
  window

## Media (`winui-svelte/media`)

The controls keep WinUI's names: `Image`, `ImageBrush`, `ImageIcon`,
`BitmapIcon`, `PathIcon`, `MediaPlayerElement` and `MediaTransportControls`
come from `winui-svelte/components` with WinUI's properties and events
`winui-svelte/media` adds what a bare prop cannot say, and is opt-in

### Image sources

`Image.source`, `ImageIcon.source`, `ImageBrush.imageSource` and
`MediaPlayerElement.posterSource` take any of these:

| Form | Becomes |
|---|---|
| a URI string (`https://`, `ms-appx://`, a file path such as `C:\pics\a.png`) | a `BitmapImage` with `UriSource`; `.svg` makes an `SvgImageSource` |
| the bytes of a file (`Uint8Array`, `ArrayBuffer`) | the same, decoded from an in-memory stream; SVG text is told by its `<svg` element |
| an `ImageSource` object | itself: `BitmapImage`, `SvgImageSource`, `SoftwareBitmapSource`, `RenderTargetBitmap` |
| a snippet holding a value object | `<Image>{#snippet source()}<BitmapImage decodePixelWidth={64} uriSource={path} />{/snippet}</Image>`, as XAML writes `<Image.Source>` |

`BitmapImage` and `SvgImageSource` are components too, with all their
properties (`decodePixelWidth`, `decodePixelHeight`, `decodePixelType`,
`createOptions`, `autoPlay`, `rasterizePixelWidth`, `rasterizePixelHeight`,
`uriSource`) and events (`onimageopened` and `onimagefailed` on the `Image`;
`ondownloadprogress` and `onimageopened` on the bitmap; `onopened` and
`onopenfailed` on the SVG)
`WriteableBitmap` and `BitmapSource` have no component: a `WriteableBitmap`
takes its size when it is made (`writeableBitmapOf` makes one), and `BitmapSource` is abstract

| Export | Does |
|---|---|
| `writeableBitmapOf({ width, height, pixels })`, `setBitmapPixels({ source, width, height, pixels })` | An image source from straight RGBA bytes (the pixel buffer is written through `IBufferByteAccess`), and the way to draw another frame in it |
| `bitmapImageOf({ source, decodePixelWidth, decodePixelHeight, decodePixelType, createOptions, autoPlay, onFailed })` | A `BitmapImage` from a URI, a `data:` URI or bytes, with the options set before it loads |
| `svgImageSourceOf({ source, rasterizePixelWidth, rasterizePixelHeight, onFailed })` | An `SvgImageSource` from markup, a `.svg` URI, a `data:` URI or bytes |
| `decodeDataUri(uri)`, `isDataUri(text)` | A `data:` URI as `{ mimeType, bytes }`: WinUI opens no `data:` URI itself |

WinUI raises `ImageFailed` for a URI it cannot open; bytes it cannot decode
raise nothing, and `onFailed` receives the error of `SetSourceAsync` instead

What WinUI decodes: `BitmapImage` reads PNG, JPEG, GIF, BMP, ICO and TIFF, and
WebP, AVIF, HEIC and others where the Windows codec is installed (a GIF or
APNG animates when `autoPlay` is true, which is the default)
`SvgImageSource` renders static SVG: shapes, paths, text, gradients,
patterns, clip paths, masks, `use` and styling by presentation attributes, a
`style` attribute and an internal `<style>` element
It runs no scripts, plays no SMIL or CSS animation, loads no external
resource, and ignores unsupported CSS rather than failing

Sharp SVG on a high-DPI screen: an SVG is rasterised at its own size, then
scaled
Set `rasterizePixelWidth` and `rasterizePixelHeight` to the displayed size
times the screen's `RasterizationScale`

Colouring an SVG icon: an `SvgImageSource` keeps the colours it is drawn in
`ImageIcon` has no `showAsMonochrome` (`BitmapIcon` does, over a bitmap's alpha
channel, with `foreground` as the colour)
For a glyph that is only a path, use `PathIcon` (`data="M12 2 L22 22 L2 22 Z"`)
or a `Path`, whose `fill` is a brush

### MediaPlayerElement and MediaTransportControls

`source` takes a URI (opened as a `MediaSource`) or any
`IMediaPlaybackSource`: a `MediaSource`, a `MediaPlaybackItem` or a
`MediaPlaybackList`
`areTransportControlsEnabled`, `autoPlay`, `stretch`, `posterSource`,
`isFullWindow` and the `transportControls` snippet are WinUI's
The real `MediaPlayer` is `native.mediaPlayer`:

```svelte
<MediaPlayerElement {@attach control(native => (player = native.mediaPlayer))} />
```

`MediaTransportControls` takes WinUI's `isPlayPauseButtonVisible`,
`isSeekBarVisible`, `isVolumeButtonVisible`, `isCompact` and the rest of its
`Is*Visible` and `Is*Enabled` properties

### A MediaPlayer with no window

```ts
import { createMediaPlayer, mediaSourceOfBytes } from "winui-svelte/media";

const audio = createMediaPlayer({ source: "ms-appx:///chime.mp3", volume: 0.5 });
audio.player.play();
audio.state.position;
audio.dispose();
```

`createMediaPlayer(options)` makes a `Windows.Media.Playback.MediaPlayer`,
sets `autoPlay`, `isLoopingEnabled`, `isMuted`, `volume`, `playbackRate` and
`source`, listens to the events named like WinUI's (`onMediaOpened`,
`onMediaEnded`, `onMediaFailed`, `onCurrentStateChanged`, `onVolumeChanged`,
`onSeekCompleted`, `onBufferingStarted`, `onBufferingEnded`,
`onMediaPlayerRateChanged`, `onPlaybackMediaMarkerReached`,
`onSourceChanged`, `onIsMutedChanged`), and returns:

- `player`, the real `MediaPlayer`
- `state`, a `PlaybackState` of runes: `playbackState`, `position` and
  `naturalDuration` in milliseconds, `bufferingProgress`, `canSeek`,
  `volume`, `isMuted` and `isEnded`
- `dispose()`, which unsubscribes and closes the player

`mediaSourceOfBytes({ bytes, contentType })` makes a source from an in-memory
file; `observePlayback({ player, poll })` fills a `PlaybackState` from any
object shaped like a player

`MediaPlayer` raises all of its events on a thread of its own, and the
bindings do not deliver an event raised on another thread
The handlers in the options therefore run only where WinUI raises on the UI
thread; `state` is read again every 100 ms on the UI thread and is what to
rely on

## Win2D (`winui-svelte/win2d`)

Opt-in: an app that does not import it bundles none of it and never loads
`Microsoft.Graphics.Canvas.dll`
Win2D is the NuGet package
`Microsoft.Graphics.Win2D` (the WinUI 3 build, MIT, Microsoft); `winapp.yaml`
restores it, `pnpm build` ships the library in `dist/bin/<architecture>`, and
`initWindowsAppSdk` puts that folder on `PATH`

The four controls are components made from the metadata like the rest:
`CanvasControl`, `CanvasAnimatedControl`, `CanvasVirtualControl` and
`CanvasSwapChainPanel` (props, `ondraw`, `oncreateresources`, `onupdate`)
The
rest of Win2D is its classes, used as they are, with the helpers below

### Canvas

`<Canvas draw={({ painter, width, height, dpi, device }) => { ... }} />` is a
`CanvasControl` you draw on with a function
`draw` runs in an `$effect`: what it
reads is tracked, and when it changes, or the control is resized, it runs again
and the control is invalidated
Each call on `painter` is kept, and the Draw
event replays them on the control's session
`createResources` runs once the
device exists; `ondrawn(count)` after each redraw; `dpi` is the screen's, and
`dpiScale` (a `CanvasControl` prop) scales it
A `Painter` is also made at once
on a session with `drawingPainter(session)`, and the same calls exist as
functions on a session: `clear`, `fillRectangle`, `drawRectangle`,
`fillRoundedRectangle`, `fillEllipse`, `drawEllipse`, `fillCircle`, `drawCircle`,
`drawLine`, `drawText`, `fillGeometry`, `drawGeometry`, `drawImage`, `drawBitmap`,
`setTransform`
A `Paint` is a `Color` (`{ a, r, g, b }`, 0 to 255) or any brush
(`isColor` tells them apart)
`painter.transformed({ matrix, draw })` scopes a
transform; `IDENTITY`, `translation`, `scaling`, `rotation` and `multiply` build
the `Matrix3x2`
`Recording` and `Command` are what `Canvas` keeps the calls in;
`CanvasFrame` and `CanvasProps` type the component; `TextOptions` and `Figure`
type the helpers

The bindings choose an overload from the argument count and JavaScript types
alone, so `session.fillRectangle(x, y, w, h, brush)` calls the Color overload and
`session.clear(color)` the Vector4 one
The functions above find the right
overload by its parameter names; for another Win2D method with overloads of one
arity, check the pixels

### Resources

`sharedDevice()`, `createRenderTarget({ creator, width, height, dpi })` (an
off-screen surface: no window needed), `readPixels(surface)` and
`pixelAt({ pixels, x, y })` (BGRA bytes), `loadBitmap({ creator, source })` (the
bytes of a PNG or JPEG, a URI or a file path), `bitmapFromColors`,
`createTextFormat`, `polylineGeometry`, `roundedRectangleGeometry` and
`circleGeometry`

### Classes and effects

The classes a draw function uses are re-exported from the bindings: `CanvasDevice`, `CanvasBitmap`, `CanvasRenderTarget`, `CanvasCommandList`, `CanvasAlphaMode`, `CanvasImageInterpolation`, `CanvasComposite`, `CanvasBlend`, `CanvasDpiRounding`, `CanvasSolidColorBrush`, `CanvasLinearGradientBrush`, `CanvasRadialGradientBrush`, `CanvasImageBrush`, `CanvasGeometry`, `CanvasPathBuilder`, `CanvasStrokeStyle`, `CanvasCapStyle`, `CanvasLineJoin`, `CanvasDashStyle`, `CanvasFigureLoop`, `CanvasFigureFill`, `CanvasTextFormat`, `CanvasTextLayout`, `CanvasHorizontalAlignment`, `CanvasVerticalAlignment`, `CanvasWordWrapping`
Effects are ICanvasImage: set `source` and draw one with `drawImage`
Re-exported: `GaussianBlurEffect`, `DirectionalBlurEffect`, `ColorMatrixEffect`, `BlendEffect`, `BlendEffectMode`, `ShadowEffect`, `SaturationEffect`, `GrayscaleEffect`, `BrightnessEffect`, `ContrastEffect`, `HueRotationEffect`, `InvertEffect`, `SepiaEffect`, `OpacityEffect`, `CompositeEffect`, `ArithmeticCompositeEffect`, `CropEffect`, `ScaleEffect`, `BorderEffect`, `MorphologyEffect`, `EmbossEffect`, `SharpenEffect`, `Transform2DEffect`, `TintEffect`, `ExposureEffect`
Any other class is
imported from `#winui/microsoft/graphics/canvas/...`
The types `Color`, `Matrix3x2`, `Rect`,
`Vector2`, `Vector4`, `CanvasDrawingSession`, `ICanvasImage` and `ICanvasBrush`
are re-exported too

### Effects on elements (the CSS bridge)

A Win2D effect graph is a Composition effect: `createEffectBrush({ compositor,
effect, sources })` builds the `CompositionEffectBrush`, where `effectSource(name)`
(a `CompositionEffectSourceParameter`, `ELEMENT_SOURCE` by default) stands for the
pixels that go in
`applyEffect({ element, effect, source })` puts it on an
element as a child sprite visual and returns a function that removes it;
`source` is `BACKDROP` (what is behind the element: `backdrop-filter`, a blend) or
another element (its own pixels: `filter: blur()`, `drop-shadow()`,
`grayscale()`, `mix-blend-mode`)
`applyEffect` cannot take an element as its own source (its child visual
would be part of what it samples)
The CSS properties can: `filter`, `backdrop-filter`, `mix-blend-mode`,
`mask-image` and `clip-path` of `winui-svelte/css/filter` and
`winui-svelte/css/clip` draw an element through an effect graph, with a sprite
visual in its parent's child visual slot that samples the element's visual
through a visual surface (which renders it whatever its `IsVisible`) while the
element hides itself ([`src/css/API.md`](src/css/API.md#filters-blends-and-masks-filter-backdrop-filter-mix-blend-mode-mask-image))
`elementVisualOf(element)` is the same from code: `setEffects(effects)`,
`setClip(shape)` and `setBlur(radius)` on one element's visual
The effect graph is checked on pixels without a window
(`src/win2d/effect-graph.test.ts`), and the effects in a real window through
`PrintWindow` (`test/effects.test.ts`, with `examples/effects`)

### Canvas 2D (`winui-svelte/win2d/context-2d`)

Opt-in, and a separate subpath: an app that imports only `winui-svelte/win2d`
bundles none of it
It makes a Win2D canvas usable as an HTML canvas, so a library written for a
browser canvas (a chart, a game engine, d3's canvas code) draws on it unchanged

```ts
import { createCanvas2D } from "winui-svelte/win2d/context-2d";

const canvas = createCanvas2D({ width: 300, height: 150 });
const context = canvas.getContext("2d");
context.fillStyle = "rgb(0, 128, 0)";
context.fillRect(10, 10, 100, 50);
```

How a library gets the canvas:

- `createCanvas2D({ width, height })` makes a `CanvasElement` that draws on a
  render target of its own: no window needed (tests, `getImageData`,
  `canvas.target` as an image for Win2D); call it after `initWindowsAppSdk`
- `<Canvas2D bind:canvas draw={canvas => ...} />` shows a `CanvasElement` in a
  `CanvasControl`; `draw` runs once the control has a size and again, on a
  cleared canvas, when state it read changes or the control is resized
  (`shouldFit`, on by default, gives the canvas the control's size); whatever is
  drawn on the canvas, whenever, repaints the control
  The component takes a `CanvasControl`'s props (`width`, `height`, `clearColor`
  and so on), and pointer events as below

A `CanvasElement` has `width` and `height` (setting either clears the canvas
and resets the context, as in a browser), `getContext("2d")` (the same
`Context2D` every time; any other kind gives `null`), `style` (`width`, `height`,
`display` and any other property, with `setProperty`), `getBoundingClientRect()`,
`clientWidth`, `clientHeight`, `offsetWidth`, `offsetHeight`, `addEventListener`,
`removeEventListener` and `dispatchEvent`
It has no document: there is no `ownerDocument`, and `toDataURL` and `toBlob` exist only after `installImageCodecs()`, and
`parentNode` is `null`

Pointer events of the control reach the canvas as DOM events: `pointerdown`,
`pointermove`, `pointerup`, `pointerenter`, `pointerleave`, `pointercancel`, the
`mouse` twins of those, `click` (on every release) and `wheel`, each with
`clientX`, `clientY`, `offsetX`, `offsetY`, `button`, `buttons`, `pointerId`,
`pointerType`, the modifier keys and, for `wheel`, `deltaX` and `deltaY`
The positions are in canvas pixels, which are the control's device-independent
pixels
The handlers an app passes to `Canvas2D` (`onpointerpressed` and the others) are
still called
Not tried: the events need a real pointer, which a test must not inject

**Supported** (`Context2D`, all positional like the platform's):

| Area | Members |
| --- | --- |
| State | `save`, `restore`, `reset`, `isContextLost`, `getContextAttributes`, `canvas`, `drawFocusIfNeeded` (a no-op: there is no element to focus) |
| Styles | `fillStyle`, `strokeStyle` (any CSS color the CSS part reads, `CanvasGradient`, `CanvasPattern`), `globalAlpha`, `lineWidth`, `lineCap`, `lineJoin`, `miterLimit`, `setLineDash`, `getLineDash`, `lineDashOffset` |
| Compositing | `globalCompositeOperation`: `source-over`, `source-in`, `source-out`, `source-atop`, `destination-over`, `destination-in`, `destination-out`, `destination-atop`, `lighter`, `copy`, `xor` |
| Shadows | `shadowColor`, `shadowBlur`, `shadowOffsetX`, `shadowOffsetY` (a Win2D shadow effect of the drawing) |
| Transforms | `scale`, `rotate`, `translate`, `transform`, `setTransform` (six numbers or a matrix object), `resetTransform`, `getTransform` |
| Paths | `beginPath`, `closePath`, `moveTo`, `lineTo`, `bezierCurveTo`, `quadraticCurveTo`, `arc`, `arcTo`, `ellipse`, `rect`, `roundRect`, `fill` (`nonzero` or `evenodd`, current path or `Path2D`), `stroke`, `clip`, `isPointInPath`, `isPointInStroke` |
| Rectangles | `fillRect`, `strokeRect`, `clearRect` |
| Text | `fillText`, `strokeText` (with `maxWidth`), `measureText`, `font` (the CSS shorthand, read in house), `textAlign`, `textBaseline`, `direction` |
| Images | `drawImage` (three, five and nine arguments) from a `CanvasBitmap` (made with `loadBitmap` or `bitmapFromColors`) or another canvas, itself included; `imageSmoothingEnabled`, `imageSmoothingQuality` |
| Pixels | `getImageData`, `putImageData` (with a dirty rectangle), `createImageData`; `ImageData` is RGBA, not premultiplied |
| Brushes | `createLinearGradient`, `createRadialGradient`, `createPattern` (`repeat`, `repeat-x`, `repeat-y`, `no-repeat`), `CanvasPattern.setTransform` |
| Path2D | the path calls above, `addPath` with a matrix, and a constructor that takes another `Path2D` or an SVG path string (`M L H V C S Q T A Z`, relative and absolute) |

**Different from a browser**, because Win2D works another way:

- A pattern is a Win2D image brush; one that does not repeat is clipped to the
  image
- A radial gradient is one circle with an origin in Win2D, the canvas has two:
  a start radius is exact only when both circles share their center
- A compositing operation combines the drawing with the canvas inside the
  bounds of what was drawn, not over the whole canvas, so `copy` leaves the
  rest of the canvas alone; with a clip, `source-in`, `source-out`,
  `destination-in`, `destination-atop` and `copy` also change what is outside
  the clip (the clip is applied to the shape, because a Direct2D layer hides
  the canvas from the operation)
- The `hanging` and `ideographic` baselines are approximations (Win2D does not
  expose the font's tables); `alphabetic`, `top`, `middle` and `bottom` follow
  the line metrics
- The boxes of `measureText` come from the Win2D layout (the advance for
  `width`, the ink for `actualBoundingBox*`); the `emHeight*` members are the
  line's ascent and descent
- `drawImage` takes a rectangle with a negative size as it is given to Win2D:
  mirroring is not promised
- One canvas pixel is one device-independent pixel: on a scaled screen the
  control stretches the canvas, and a library cannot read the scale from
  `devicePixelRatio`
- A new canvas (and the `width` setter) clears to transparent black
  explicitly: Direct2D hands out surfaces with whatever the memory held
- A call that throws in the platform throws the same class here (`RangeError`
  for a negative radius, `SyntaxError` for a bad color stop); a bad value for a
  property is ignored, as in a browser
- A shape drawn with a pattern, a gradient, a shadow or a compositing operation
  costs a Win2D brush, effect or command list per call, so a drawing of
  thousands of shapes is slower than in a browser

**Not supported:**

| Member | Why |
| --- | --- |
| `createConicGradient` | Win2D has no conic gradient brush; it throws |
| `globalCompositeOperation` of `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity` | Win2D blends an effect's inputs, not a shape with the canvas; the value is ignored |
| `filter` | it is always `none`; use a Win2D effect on the image |
| `letterSpacing`, `wordSpacing`, `fontKerning`, `fontStretch`, `fontVariantCaps`, `textRendering` | No Win2D equivalent set per draw call |
| `drawImage` of an `HTMLImageElement`, `HTMLVideoElement` or `OffscreenCanvas` | There is no DOM; decode with `loadBitmap`, or draw another `CanvasElement`; an `ImageBitmap` from `winui-svelte/web-apis/images` draws |
| `transferControlToOffscreen`, `captureStream` | There is no `OffscreenCanvas` or media stream; `toBlob`, `convertToBlob` and `toDataURL` come with `winui-svelte/web-apis/images` |
| `getContext` of `webgl`, `webgl2`, `bitmaprenderer`; the `alpha`, `desynchronized` and `willReadFrequently` options | One 2D context, always with an alpha channel |
| `scrollPathIntoView` | There is no element tree to scroll; the method is absent |
| `requestAnimationFrame`, `devicePixelRatio`, `document`, `window` | Globals of a browser, defined by the opt-in `winui-svelte/web-apis/timing`, `/screen` and `/page`; `getComputedStyle` has no counterpart |

The working example is `examples/win2d`: `bar-chart.ts` draws a chart with
nothing but the calls above, `Win2DApp.svelte` shows it in a `Canvas2D`, and
`src/win2d/context-2d/context-2d.test.ts` draws the same chart on a render
target and checks the pixels

The working example is `examples/win2d` (`test/win2d.test.ts` runs it in a real
window and checks the redraw; `src/win2d/win2d.test.ts` draws on a render
target and checks the pixels)

## Windows devices (`winui-svelte/devices`)

Windows' own device APIs (`Windows.Devices.*`, `Windows.System.Power`,
`Windows.Networking.Connectivity`, `Windows.Media.Devices`,
`Windows.Gaming.Input`) as small typed functions and Svelte runes
The names are Windows' own (`DeviceWatcher`, `BluetoothLEAdvertisementWatcher`,
`GattCharacteristic`), not the web's; what Svelte adds is reactivity and typed
options
Each area is an opt-in subpath, so an app that imports none of them bundles none

| Specifier | What |
|---|---|
| `winui-svelte/devices` | everything below |
| `winui-svelte/devices/enumeration` | `deviceWatcher`, `findAllDevices`, `DeviceInterfaceClass`, `deviceChanges`, `liveTracker` |
| `winui-svelte/devices/input` | `inputDevices`, `readInputCapabilities` |
| `winui-svelte/devices/bluetooth` | adapter, devices, `bluetoothScanner`, `scanBluetoothAdvertisements`, GATT, UUIDs, radios |
| `winui-svelte/devices/printers` | `printers`, `listPrinters`, `printFile` |
| `winui-svelte/devices/power` | `battery`, `systemPower` |
| `winui-svelte/devices/network` | `networkInformation` |
| `winui-svelte/devices/audio` | `audioDevices` |
| `winui-svelte/devices/display` | `displays`, `getDisplayMonitors` |
| `winui-svelte/devices/gamepad` | `gamepads`, `pressedButtons` |
| `winui-svelte/devices/sensors` | `lightSensor`, `accelerometer`, `inclinometer` |

The bindings for these classes come from `pnpm bindings` (the classes are in
`lateClasses` in `scripts/codegen/tables.ts`)
Everything here was checked to work from `node.exe` with no package identity;
"Failure modes" below lists what an unpackaged app cannot do

### Conventions

- A rune is called in a component script (or a `.svelte.ts` module) on the UI thread, and keeps its subscriptions only while an effect reads it: a getter read in markup, `$derived` or `$effect` listens, a read outside an effect only reads
- A watcher-like rune (`deviceWatcher`, `bluetoothScanner`, `radios`) stops when its component is destroyed, when its `signal` aborts, or when `stop()` is called
- Every rune takes `deliver`, how a native event reaches the UI thread; the default is the UI thread's dispatcher queue, so call the rune where there is one, or pass `deliver: deliverNow` in a program with no window
- A fixed choice is an `as const` object with a type of the same name (`DeviceInterfaceClass`, `BluetoothTransport`, `NotificationMode`, `PrinterStatus`); WinRT's own enums are re-exported under their own names (`DeviceClass`, `RadioKind`, `GattCommunicationStatus`)
- A list is a keyed reactive collection (`KeyedCollection`): `{#each collection.items as device (device.id)}`, with `get(key)`, `has(key)`, `keys` and `size`
- A change makes a new snapshot object, so a keyed block redraws the row
- Every rune reads through a `source` (or `defaults`, `list`, `createSource`) option whose default is the Windows end: `windowsInputSource`, `windowsPowerSource`, `windowsNetworkSource`, `windowsAudioDefaults`, `windowsDisplaySource`, `windowsGamepadSource` and `windowsPrinterSource` are those defaults, exported so a test or a wrapper can use or replace them
- The WinRT enums the results are made of are re-exported under their own names: `AudioDeviceRole`, `BatteryStatus`, `BluetoothCacheMode`, `BluetoothLEScanningMode`, `DisplayMonitorConnectionKind`, `DisplayStatus`, `EffectivePowerMode`, `EnergySaverStatus`, `GamepadButtons`, `NetworkConnectivityLevel`, `NetworkCostType`, `PointerDeviceType`, `PowerSupplyStatus`, `RadioAccessStatus`, `RadioKind`, `RadioState`, `UserPresenceStatus`

### Device enumeration

```svelte
<script lang="ts">
  import { DeviceClass, deviceWatcher } from "winui-svelte/devices/enumeration";
  import { StackPanel, TextBlock } from "winui-svelte/components";

  const speakers = deviceWatcher({
    deviceClass: DeviceClass.AudioRender,
    requestedProperties: ["System.Devices.InterfaceEnabled"]
  });
</script>

<StackPanel>
  {#each speakers.devices.items as device (device.id)}
    <TextBlock>{device.name}</TextBlock>
  {/each}
</StackPanel>
```

`deviceWatcher(options)` is WinRT's `DeviceWatcher` (its Added, Updated, Removed,
EnumerationCompleted and Stopped events) over `DeviceInformation.CreateWatcher`
The options are the query (`selector`, an Advanced Query Syntax filter;
`deviceClass`, a `DeviceClass`; `kind`, a `DeviceInformationKind`;
`requestedProperties`, canonical property names) plus `signal` and `deliver`
It returns `devices` (the collection of `DeviceSnapshot`), `status`
(`DeviceWatcherStatus`), `isEnumerationCompleted`, `error` and `stop()`

`findAllDevices(options)` is the one-shot `DeviceInformation.FindAllAsync` with the same query, resolving to `DeviceSnapshot[]`

A `DeviceSnapshot` is `id`, `name`, `kind`, `isEnabled`, `isDefault`, `properties` (a `Map` of the requested properties, unboxed to strings, numbers, booleans, `bigint`, `Date`, `Uint8Array` or string arrays) and `pairing`
Windows lists no property names it was not asked for, so only `requestedProperties` appear

`DeviceInterfaceClass` names the device interface classes WinRT has no class for (`mouse`, `keyboard`, `humanInterfaceDevice`, `usb`, `serialPort`, `printer`), and `selectorOfInterfaceClasses(...classes)` builds the filter: this is how to list USB, HID and serial ports (names and ids only)

`getDeviceAccess(deviceClass)` asks `DeviceAccessInformation` whether the user and the system let the app use a class of devices (the microphone, the camera, location): a `DeviceAccessStatus` (`allowed`, `deniedByUser`, `deniedBySystem`, `unspecified`) and whether the user would be prompted; listing devices needs no consent, opening them can

`deviceChanges(query)` and `liveTracker({ subscriptions })` are the two building blocks the other runes use: a subscription to devices coming and going, and the glue that makes a getter re-run when native events fire

### Input devices

```svelte
<script lang="ts">
  import { inputDevices } from "winui-svelte/devices/input";
  const input = inputDevices();
</script>

<TextBlock>Mouse {input.hasMouse ? `with ${input.mouseButtons} buttons` : "absent"}</TextBlock>
```

`inputDevices()` reads `MouseCapabilities`, `KeyboardCapabilities`,
`TouchCapabilities` and `PointerDevice.GetPointerDevices`, and reads them again
when a mouse, keyboard or HID device (touch screens and pens included) is
plugged in or removed: Windows has no event for the capabilities themselves,
so a device watcher of the mouse, keyboard and HID interfaces says when to look
It has `hasMouse`, `mouseButtons`, `hasWheel`, `hasKeyboard`, `hasTouch`,
`touchContacts`, `hasPen`, `canHover` and `capabilities` (all of them in one object,
with the pointer devices)

`readInputCapabilities(source?)` is the same read without the reactivity, and it is
the one reader the pointer media features (`hover`, `pointer`, `any-hover`,
`any-pointer`) share: `canHover` is `any-hover: hover`, `hasFinePointer` is
`any-pointer: fine` and `hasCoarsePointer` is `any-pointer: coarse`

`MouseDevice` (relative mouse motion) is not offered: `GetForCurrentView` needs a
`CoreWindow`, which a WinUI 3 desktop app does not have

### Bluetooth

| API | Windows |
|---|---|
| `getBluetoothAdapter()` | `BluetoothAdapter.GetDefaultAsync`: address, Low Energy, classic, central and peripheral support |
| `radios()`, `getRadios()`, `requestRadioAccess()`, `setRadioState()` | `Windows.Devices.Radios.Radio` (Wi-Fi, Bluetooth, mobile broadband, FM) |
| `bluetoothDevices({ transport, isPaired })`, `bluetoothDeviceSelector()` | the known classic or Low Energy devices, paired or not, as a `deviceWatcher` |
| `getDevicePairing({ id })` | `DeviceInformationPairing`: `isPaired`, `canPair`, `protectionLevel` (read only) |
| `bluetoothScanner(options)` | `BluetoothLEAdvertisementWatcher` as a keyed collection by address |
| `scanBluetoothAdvertisements(options)` | the same scan as an async iterable |
| `openBluetoothLEDevice({ address })`, `getGattServices()`, `getGattCharacteristics()` | `BluetoothLEDevice.FromBluetoothAddressAsync`, `GetGattServicesAsync`, `GetCharacteristicsAsync` |
| `readCharacteristic()`, `writeCharacteristic()` | `ReadValueAsync`, `WriteValueAsync` with `Uint8Array` values |
| `subscribeToCharacteristic()`, `characteristicValues()` | `ValueChanged` after writing the Client Characteristic Configuration descriptor, as a callback or an async iterable |
| `uuidOf()`, `uuidOfShortId()`, `shortIdOfUuid()`, `isUuid()`, `GattServiceUuids`, `GattCharacteristicUuids` | `BluetoothUuidHelper` and the assigned numbers |
| `addressText()`, `addressOfText()` | a 48-bit address and `AA:BB:CC:DD:EE:FF` |

```svelte
<script lang="ts">
  import { bluetoothScanner } from "winui-svelte/devices/bluetooth";
  const scanner = bluetoothScanner({ filter: { minimumRssi: -80 } });
  scanner.start();
</script>

{#each scanner.advertisements.items as ad (ad.addressText)}
  <TextBlock>{ad.localName || ad.addressText}  {ad.rssi} dBm</TextBlock>
{/each}
```

An advertisement is `address`, `addressText`, `localName`, `serviceUuids`,
`manufacturerData` (`companyId` and bytes), `dataSections`, `rssi`,
`transmitPower`, `timestamp` and the flags (`isConnectable`, `isScannable`,
`isDirected`, `isScanResponse`, `isAnonymous`)
The `filter` (`localName`, `serviceUuids`, `companyId`, `minimumRssi`) runs on
each advertisement received; the scan is passive unless
`scanningMode: BluetoothLEScanningMode.Active`

`BLUETOOTH_DEVICE_PROPERTIES` is the list of properties worth asking for when listing Bluetooth devices (address, connected, paired, signal strength)

Nothing here pairs, connects or writes by itself: `getGattServices` and the
reads connect, `writeCharacteristic` and `subscribeToCharacteristic` change the
device, and they are the calls the app makes on purpose
Close a device (`device.close()`) when done, or Windows keeps the connection

### Printers

`printers(options)` lists the installed printers from `EnumPrintersW`: `name`,
`serverName`, `portName`, `driverName`, `location`, `jobCount`, the raw `status`
(`PrinterStatus` flags) and `attributes` (`PrinterAttribute` flags), and the
readings made from them: `isDefault`, `isOffline` (offline, or Use Printer
Offline), `isPaused`, `hasError` (jam, no paper, no toner, door open, error),
`isNetwork`, `isShared`
Printers added and removed are noticed through a device watcher of the printer
interface class; their state is read again every `pollMilliseconds` (5000, 0
for never) while an effect reads, because Windows raises no event for a printer
going offline
A failed `printFile` throws `PrintFileError` with the shell's code
`listPrinters()` is the one-shot read, and `deviceWatcher({ selector:
selectorOfInterfaceClasses(DeviceInterfaceClass.printer) })` gives the WinRT
device interface of each printer

`printFile({ path, printerName? })` prints a file through the program
registered for its type (`ShellExecuteW`, the `print` or `printto` verb): it
sends a real print job, so nothing calls it for you

Windows' own print dialog for an app (`PrintManagerInterop.ShowPrintUIForWindowAsync`)
is not offered: it needs a `PrintTaskRequested` handler that hands Windows a
`PrintDocument` built by XAML, which the bindings give an unpackaged app no way to
build; print the document to a file and use `printFile`, or draw it with Win2D

### Power, network, display, audio, gamepads and sensors

| Rune | Reads | Fields |
|---|---|---|
| `battery()` | `Battery.AggregateBattery`, `PowerManager` | `hasBattery`, `percent`, `isCharging`, `isDischarging`, `isOnAcPower`, `isEnergySaverOn`, `remainingDischargeMilliseconds`, `healthPercent`, `reading` |
| `systemPower()` | `Microsoft.Windows.System.Power.PowerManager` (Windows App SDK) | `displayStatus`, `isDisplayOn`, `effectivePowerMode`, `isUserPresent`, `resumeCount`, `reading` |
| `networkInformation()` | `NetworkInformation` | `isOnline`, `connectivity`, `profileName`, `isMetered`, `isRoaming`, `isWifi`, `isMobile`, `signalBars`, `reading` (with every profile name) |
| `displays()` | `DisplayArea` and its watcher | `areas` (bounds and work area), `primary`, `count`; needs the Windows App SDK, which a window has |
| `getDisplayMonitors()` | `DisplayMonitor` | name, native resolution, physical size, DPI, luminance; needs no window |
| `audioDevices()` | `DeviceClass.AudioRender` and `AudioCapture` watchers, `MediaDevice` | `outputs`, `inputs` (watchers), `defaultOutputId`, `defaultInputId`, and the communications ids |
| `gamepads()` | `Gamepad` | `gamepads`, each with `isWireless` and `read()` for the sticks, triggers and buttons; `pressedButtons()` names the buttons |
| `lightSensor()`, `accelerometer()`, `inclinometer()` | `Windows.Devices.Sensors` | `isAvailable`, `reading` (null when the machine has no such sensor) |

### Failure modes

- A watcher or scan the system stops (access denied, the service stopped, Bluetooth off, no adapter) ends with `status` `Aborted` and an `error` (`DeviceWatcherAbortedError`, `BluetoothScanAbortedError`); the entries found so far stay
- A GATT call that does not succeed throws `BluetoothLowEnergyError` with the `GattCommunicationStatus` (`Unreachable`, `ProtocolError`, `AccessDenied`)
- `getBluetoothAdapter()` resolves to `null` and `radios` is empty when the machine has no adapter
- An event Windows refuses to an app without a package identity is left unsubscribed: the value is still read live, it only does not update by itself
- `systemPower` polls once a second and does not subscribe to `PowerManager`'s
  events: any subscription (even one removed again) keeps the Node process from
  exiting, and Windows raises them on a thread of its own, which dynwinrt does
  not deliver; `SystemSuspendStatus` cannot be read before its event has fired,
  so `resumeCount` counts a wake as a gap of over ten seconds between two
  ticks; `userPresenceStatus` reads 2 until Windows has said (a value the
  bindings do not name); `EnergySaverStatus` is the one `battery` already
  reads (`isEnergySaverOn`); the properties need the Windows App SDK
- A machine without a sensor, gamepad, battery or printer reports it (`isAvailable` false, an empty list, `hasBattery` false), never an error
- The radio state, pairing prompts, Bluetooth consent and the microphone are the user's: reading a list needs no consent, using a device can

### Known to work unpackaged, and what does not

Works from `node.exe` without a package identity: device enumeration and watchers
(audio, HID, USB, serial, printers, Bluetooth devices, radios), the mouse,
keyboard, touch and pointer capabilities, Bluetooth LE advertisement scanning,
GATT reads, writes and notifications on an open device, Bluetooth adapter and
radios, battery and power, network status and its change event, display areas
and monitors, default audio endpoints and their change events, gamepads and
sensors (`getDefault`), Win32 printer enumeration and state

Does not work or is not offered:

- `MouseDevice` events: they need a `CoreWindow`
- The print dialog of `PrintManager`: see Printers
- Pairing and unpairing (`PairAsync`): they open system prompts the app must own; use the `DeviceInformationPairing` of a `DeviceInformation` directly
- Geolocation: `Geolocator` needs the location consent and a capability an unpackaged app cannot declare; the bindings hold `Windows.Devices.Geolocation.Geopoint` for the values only
- Gamepad input while the window is in the background: Windows delivers it to the focused window
- Sensors on a desktop: there are none, so `isAvailable` is false

## Store and package (`winui-svelte/store`)

The Microsoft Store and package APIs (`Windows.Services.Store.StoreContext`,
`Windows.ApplicationModel.Package`, `PackageCatalog`, `StartupTask`) as typed
async calls and events, opt-in
Every call that needs a package identity answers `{ hasPackage: false }` outside
a package (plain Node.js, Electron, `pnpm dev`) and never throws for the missing
identity; inside one it answers `{ hasPackage: true, value }`
The check is `GetCurrentPackageFullName`, not the exception `Package.Current`
throws

| Export | What |
|---|---|
| `hasPackage()`, `getPackageInfo()` | whether the process has an identity; the package's name, full name, family name, publisher, version and install path, or null |
| `getAppLicense({ window })` | `isActive`, `isTrial`, `skuStoreId`, `expirationDate` (null when it never ends) |
| `watchLicense({ window, pollMilliseconds })` | a `LicenseWatcher` that raises `offlinelicenseschanged` (`onofflinelicenseschanged`); `close()` stops it |
| `checkForUpdates({ window })` | `{ updates, hasMandatory, install({ onprogress }) }`: nothing is downloaded until `install` is called, and it installs exactly the updates found |
| `watchPackages()` | a `PackageWatcher` that raises `packagestaging`, `packageinstalling` and `packageupdating` (`PackageProgressEvent`, with `progress`, `isComplete`, `errorCode`) |
| `getStartupTask({ taskId })` | the task's `state`, `enable()` (a request: read the state it returns) and `disable()` |
| `UpdateState`, `StartupState`, `PackageStage` | the closed sets, each a value plus a type |
| `windowsStoreBackend` | the real backend over the WinRT classes; `StoreBackend` is the interface the calls take, so a test swaps it |

`window` is the owner of any Store dialog: a `WindowHandle` or the native
`Window`; it is given to `IInitializeWithWindow` on the `StoreContext`, as a
desktop app must
Without it a call that shows UI is refused by Windows

Events and threads: dynwinrt delivers a callback only when Windows raises it on
the UI thread
`OfflineLicensesChanged` and the `PackageCatalog` events come from a thread of
their own, so they may never arrive
`watchLicense` takes `pollMilliseconds` to read the licence on a UI-thread timer
and raise the same event when it changed (as `winui-svelte/media` polls the
player); `install`'s `onprogress` is an async progress callback and does arrive
Treat `watchPackages` as a hint, not a guarantee

What was checked from `node.exe` with no package identity: `hasPackage()` is
false, `getPackageInfo()` is null, and every other call answers
`hasPackage: false` (`src/store/store.test.ts`; it installs and downloads
nothing)
What cannot work without an identity: the licence, the Store update check and
install, the package events and startup tasks all, because Windows ties them to
the package
Under MSIX they are expected to work as documented, but nothing here has run
under a real package yet

Replaces in the any-stt panel: with `getAppLicense`, `watchLicense`,
`checkForUpdates`, `watchPackages` and `getStartupTask` running in the packaged
`node.exe`, the Rust launcher no longer needs `licence.rs`, `updates.rs`,
`store.rs` or its `--startup-task` mode
Delete them once the calls are confirmed under the package

## Reference: the remaining exports

Exports that other sections do not need to name; each has JSDoc in its source
A test (`scripts/pack/api-docs.test.ts`) fails when a value exported by an
entry point is named nowhere in the docs

| Export | Entry point | What |
| --- | --- | --- |
| `PatchError`, `reconcile` | `winui-svelte/state` | a patch that cannot apply; `next` merged into `previous`, keeping the identity of equal parts |
| `PatchOperation`, `patchDataSchema`, `snapshotDataSchema` | `winui-svelte/state` | the protocol's change kinds and message data schemas |
| `isJsonObject` | `winui-svelte/state/host` | whether a value is a JSON object |
| `MemoryEnd` | `winui-svelte/state` | one end of an in-memory transport; `MemoryEnd.pair()` makes both |
| `requestFrameSchema`, `responseFrameSchema` | `winui-svelte/messaging` | the wire shapes of a request and its answer |
| `MessagingError`, `MessagingClosedError` | `winui-svelte/messaging` | a handler that threw; a pending send whose link closed (`notify` sends without waiting and never rejects for it) |
| `exitWhenHostEnds`, `HostLink`, `HostEndOptions` | `winui-svelte/window` | ends the window process when the host's link closes or the host process is gone (see `src/state/README.md`) |
| `releaseFragment`, `rootControl`, `watchRoot`, `unwatchRoot`, `swapControl` | `winui-svelte/host` | the renderer's mount-target plumbing: release what nodes hold, find the root, watch and unwatch it, replace a control in place |
| `classNameOf` | `winui-svelte/host` | the class name (`ListView`) of a control, from the tag it was registered under, so it holds when a minifier renames classes |
| `createCssNative`, `installCssRuntime`, `unregisterStyleSheet`, `textTransforms` | `winui-svelte/css` | the CSS runtime's WinUI boundary, its installer, removal of a stylesheet, and the text each element's `text-transform` shows (the renderer reads it) |
| `animationGroups`, `effectGroups`, `visualEffectGroups`, `clipGroups`, `cursorGroups`, `environmentGroups`, `gradientGroups`, `containerGroups`, `compatGroups`, `focusGroups`, `positionGroups`, `queryGroups`, `resourceGroups`, `scrollTimelineGroups`, `surfaceGroups`, `transformGroups`, `viewTransitionGroups`, `visualStateGroups` | `winui-svelte/css/*` | the property groups each opt-in subpath adds |
| `SHEET_SUFFIX`, `SheetError` | `winui-svelte/css/sheet-module` | the module-name suffix of a compiled stylesheet; a stylesheet WinUI cannot say |
| `translateComponent` | `winui-svelte/css/sheet-module` | the build's translation of a component's `<style>`, which the validator and the Vite plugin share |
| `unusedSelectorMessages` | `winui-svelte/css/sheet-module` | the messages of Svelte's unused-selector warnings for a component read with its instances as elements, which `winuiWarningFilter` keeps |
| `winuiPreprocess`, `WinuiStyleError` | `winui-svelte/preprocess` | the Svelte preprocessor that marks a style WinUI cannot say in the editor and in `svelte-check` (and lowers `style:` and `class:` on instances for it); the error it throws |
| `winuiDiagnostics`, `winuiWarningFilter` | `winui-svelte/preprocess` | the preprocessor and the `warningFilter` as one pair for `svelte.config.js`; the filter drops `css_unused_selector` for a rule that matches a component instance |
| `rule`, `ruleName` | `winui-svelte/stylelint` | the stylelint rule `winui-svelte/no-unsupported-css`, over the same validator |
| `WINDOW_ENVIRONMENT` | `winui-svelte/vite` | the Vite environment the window's modules load in |
| `LOG_EVENT` | `winui-svelte/runner` | the event the window thread's log lines are sent under |
| `WINUI_COMPILE_OPTIONS`, `isSvelteFile`, `withElementAnimation` | `winui-svelte/compile` | what every component is compiled with, whether a file is a component, and the registration appended to a module that uses a transition |
| `TitleBarHeight`, `WindowPresentation`, `WindowTheme` | `winui-svelte/window` | the title bar height, presentation and theme choices of a window |

## Timers and I/O

`runWindow` does not hand the UI thread to `Application.Start`, whose message
loop blocks inside a libuv callback and keeps the thread's libuv from ever
turning again; it runs a pump of its own (`src/window/message-pump.ts`)
Each turn of the pump dispatches one WinUI message, then gives libuv a turn
(an immediate), so every callback Node delivers fires on the UI thread, between
two messages, with no JavaScript under it: the promise continuations a handler
queued run before the next message, as they do for a browser's events

When no message is waiting the pump sleeps in `MsgWaitForMultipleObjectsEx`,
which ends the moment a message arrives
libuv cannot be heard by that wait, so a helper thread
(`src/window/libuv-wake.ts`) waits on the loop's I/O completion port while the
UI thread sleeps; when a file read, a socket, a port or worker message or a
child process has something for libuv, it puts the packet back and signals an
event the wait includes, and the pump wakes to give libuv its turn
An idle window then sleeps up to 250 ms at a time (a safety net for what no
event announces, such as an unreferenced timer) and uses next to no CPU
The one thing nobody can ask libuv from outside is when its next timer fires:
while Node itself holds a timer (a socket timeout) the pump wakes every 16 ms
The timers an app makes go through the scheduler, which the dispatcher drives
Measured idle cost, over 20 seconds after a minute of settling, on Windows 11
(build 26300) with a 32-thread CPU and the Windows App SDK 2.2 build of this
repository: `examples/hello` used 0.15 percent of one core and `examples/tray`
(a tray icon and no window) used 0.23 percent, so nothing in the idle path needs
fixing; the first seconds after start cost more (about 2 percent of a core) while
the window loads
A host that calls `process.exit` while the window runs would end the process
under WinUI's thread (a delegate then finds the Node environment closing, and
the process can end with 0xC000027B); `initWindowsAppSdk` therefore installs
an exit hook on the host's main thread that asks the window's loop to quit and
waits for it, five seconds at most (`src/window/host-exit.ts`)
If the completion port cannot be found the pump polls instead, sleeping from
1 ms to 8 ms, and an idle window costs about 2 % of a core
While it runs the pump asks Windows for 1 ms timer ticks (`timeBeginPeriod`),
as browsers do; without them every wait rounds up to 15.6 ms
Measured, off screen: `setTimeout` is 1 ms late (15 ms without the finer
ticks), an `fs.readFile` callback and a TCP echo arrive within 5 ms, and an
idle window uses under 0.5 % of a core (`test/idle-cpu.test.ts`)
Polling the module server's port from a timer (`receive()`) is no longer
needed: its messages are libuv's, delivered by the pump, and a 30 ms timer
alone costs about 2 % of a core

`runOnUiThread` installs, before anything else runs, one scheduler on the
dispatcher (`installUiTimers`) for the standard timers: it is driven by
messages, so it needs no polling, and with 1 ms ticks it is as accurate as
libuv's own timers would be

| API | On the UI thread |
|---|---|
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval` | Works; `Timeout` has `ref`, `unref`, `hasRef`, `refresh`, `close`, and converts to its id; extra arguments and `this` as in Node; 4 ms clamp once nested deeper than 5, as in browsers; about 1 ms late |
| `setImmediate`, `clearImmediate` | Works (dispatcher queue) |
| `node:timers`, `node:timers/promises` (`AbortSignal`, `setInterval` iterator, `scheduler.wait`) | Works |
| `queueMicrotask`, `process.nextTick`, promises, `await` | Work |
| `fetch` (streaming bodies too), `WebSocket`, `EventSource` | Work |
| `fs` callbacks, `fs.promises`, `fs.watch` | Work |
| `net`, `http`, `https`, `dns` (client and server) | Work |
| `child_process` (`spawn` output events, `exec` callbacks) | Work |
| `MessageChannel` and `MessagePort` events, `Worker` messages | Work |

`examples/loop` runs each of these on the UI thread while an interval animates
a control, and `test/loop.test.ts` checks them

Pending sockets, files and timers never keep the process alive after
`runWindow` ends: `exitApplication`, the last window closing and the end of
`runWindow` stop the pump and all the dispatcher timers (`startTimer` ones
included), and `runOnUiThread` ends the process
`startTimer` is kept as `setInterval` that returns its stop function
A handler that throws does not stop the pump
Like WinUI's own loop, the pump offers each message to
`ContentPreTranslateMessage` (exported by `Microsoft.UI.Windowing.Core.dll`)
before `TranslateMessage` and `DispatchMessage`, so accelerators, access keys,
Tab and arrow focus navigation and text input (the Text Services Framework)
work as under `Application.Start`
Work that takes the UI thread, such as starting a child process (about
100 ms), shows as a gap in the animation
