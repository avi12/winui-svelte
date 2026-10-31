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
| `winui-svelte` | `src/index.ts` | `control`, `withControl`, `elementRef`, `elementSize`, `elementTheme`, `focusElement`, `mountControl`, `registerControls`, `setClassHandler`, `dispatch` / `flush` / `onFlush`, the value helpers |
| `winui-svelte/components` | `src/components/generated/index.ts` | every WinUI 3 control as a component (`StackPanel`, `ToggleSwitch`, ...) and its props type (`ToggleSwitchComponentProps`); `xamlOf`, `goToState`, `installXaml`, `resourceDictionaryOf`; importing it registers the generated bindings with the renderer |
| `winui-svelte/state` | `src/state/index.ts` | `createHostChannel()` (its `messaging` is the typed link), `hostState()`, `StateProtocol`, the transports (stdio, MessagePort, in-memory), `diff` / `applyOps` (see `src/state/README.md`) |
| `winui-svelte/host` | `src/renderer/host/host.ts` | `renderer`, the renderer WinUI controls are built through (`mountControl` makes it the active one), and the mount-target plumbing below; not for app code |
| `winui-svelte/element-animation` | `src/renderer/host/element-animation.ts` | `enableElementAnimation()`: what Svelte's `transition:`, `in:`, `out:`, `animate:` and `svelte/motion` ask of an element, on WinUI controls (the Vite plugin calls it from a component that uses them; otherwise not bundled) |
| `winui-svelte/connected-animation` | `src/renderer/host/connected-animation.ts` | `connectElement({ key, element })`, `startConnected({ key, element })`: WinUI's connected animation between two pages (opt-in) |
| `winui-svelte/keyed-list` | `src/renderer/list/keyed-list.ts` | `syncKeyed()`: sync a native collection to wanted keys, touching only what changed |
| `winui-svelte/state` | `src/state/index.ts` | `createHostChannel()`, `hostState()`, the transports (see `src/state/README.md`) |
| `winui-svelte/messaging` | `src/messaging/index.ts` | `defineMessaging(transport)`: typed `sendMessage` / `onMessage` over a ProtocolMap, as @webext-core/messaging; the state channel is built on it |
| `winui-svelte/vite` | `src/vite/index.ts` | `winuiSvelte()` Vite plugin, `startModuleServer()`, compile-error formatting |
| `winui-svelte/runner` | `src/vite/runner.ts` | `createWindowModuleRunner()`, the window thread's side of the module server |
| `winui-svelte/compile` | `src/vite/compile.ts` | `compileSvelte()` for bundlers (esbuild) and tests, `WINUI_COMPILE_OPTIONS`, `withElementAnimation()` |
| `winui-svelte/testing` | `src/vite/loader.ts` | `svelteHooks()`: Node module hooks that run `.svelte` files, with Svelte's runtime read through the package's edits (pure tests) |
| `winui-svelte/bootstrap` | `src/window/bootstrap.ts` | `initWindowsAppSdk()`; imports nothing of WinRT, safe on the host's main thread |
| `winui-svelte/thread` | `src/window/thread.ts` | `runOnUiThread()`; imports only dynwinrt, so the apartment comes first |
| `winui-svelte/window` | `src/window/index.ts` | `runWindow()`, `exitApplication()`, `createWindow()`, `startTimer()`, `systemSettings()`, the picker options (see App services) |
| `winui-svelte/app` | `src/app/index.ts` | `ensureSingleInstance()`, `notify()` (opt-in; see App lifecycle) |
| `winui-svelte/data-transfer` | `src/data-transfer/index.ts` | `enableDragEvents()`, `dropzone`, `draggable`, `filePicker`, `pickFiles`, `pickSaveFile`, `clipboard`, `launchUri` / `launchFile` / `openFolder` / `revealInExplorer`, `share`, `NativeFile`, `DataTransfer`, `DragEvent` (opt-in; see Data transfer) |
| `winui-svelte/media` | `src/media/index.ts` | `bitmapImageOf()`, `svgImageSourceOf()`, `decodeDataUri()`, `createMediaPlayer()`, `mediaSourceOfBytes()`, `observePlayback()`, `PlaybackState` (opt-in; see Media) |
| `winui-svelte/win2d` | `src/win2d/index.ts` | `Canvas`, the Win2D controls, the drawing helpers and Win2D classes, `applyEffect` (opt-in; see Win2D) |
| `winui-svelte/enums` | `src/enums.ts` | every closed set a prop or option takes: WinUI's enums, `ThemeBrush`, `ColorKeyword`, `Backdrop`, `WindowTheme`, `TrayBalloonIcon` and the rest (see Closed sets) |
| `winui-svelte/win2d/context-2d` | `src/win2d/context-2d/index.ts` | `Canvas2D`, `createCanvas2D`, `CanvasElement`, `Context2D`, `Path2D` and the rest of the HTML Canvas 2D API over Win2D (opt-in; see Canvas 2D) |
| `winui-svelte/tray` | `src/tray/index.ts` | `TrayIcon` (with its `menu`), `createTrayIcon()`, `placeMenuWindow()`, `hideToTray()`, `restoreFromTray()`, `toggleInTray()`, `removeAllTrayIcons()`, `TrayGesture` (opt-in; see System tray) |
| `winui-svelte/forms` | `src/forms/index.ts` | `Form`, `FormField`, `textField`, `numberField`, `selectField` and the other field attachments, `formButton`, `FormValues`, `validityOf` (opt-in; see Forms) |
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
- `Tween`, `Spring` and a transition's `tick` step on `requestAnimationFrame`,
  which is the same clock
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

// winui-svelte/runner: the window thread's side. `receive()` is called from a
// DispatcherQueue timer; a hot update that cannot be applied is reported and
// the window goes on.
function createWindowModuleRunner(port: MessagePort): { runner: ModuleRunner; receive(): void };
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
function runWindow(options: { onStart: () => void }): Promise<void>;
function exitApplication(): void;

// A DispatcherQueue timer on the UI thread (WinUI holds the thread, so Node's
// timers and a port's events never fire there): what takes a host's messages
// or the module server's hot updates in. Returns what stops it.
function startTimer(options: { milliseconds: number; onTick: () => void; isRepeating?: boolean }): () => void;

// A window around a component (mounted: props can change, it can be
// unmounted) or a control. Call it on the UI thread, from onStart or later.
function createWindow<Props extends object>(options: WindowOptions<Props>): AppWindow<Props>;

type WindowOptions<Props> = {
  title?: string;
  size?: { width: number; height: number };   // device pixels
  backdrop?: Backdrop;                        // "acrylic" | "acrylicBase" | "acrylicThin" | "mica" | "micaAlt" | "none"
  extendsIntoTitleBar?: boolean;
  isBackground?: boolean;                     // shown without activating (tests, captures)
} & ({ component: Component<Props>; props: Props } | { control: FrameworkElement });

interface AppWindow<Props> {
  readonly window: Window;
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
| A grid length (`GridLengthInput`) | pixels, or `GridLengthText` as XAML writes it | `"Auto"`, `"2*"`, `"120"` |
| The package's own | `Backdrop`, `WindowTheme`, `TitleBarHeight`, `WindowPresentation`, `PickerLocation`, `NavigationCacheMode`, `NavigationMode`, `MoveDirection`, `XamlKind`, `FocusKind`, `TrayGesture`, `TrayBalloonIcon` | `backdrop={Backdrop.mica}` |

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
  The rule is written
  `:global(.row)`, since Svelte scopes no class passed to a component
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
`"acrylicThin"`, `"mica"`, `"micaAlt"` or `"none"` (`Backdrop`, also taken by `createWindow`); it can
change while the window is open
WinUI itself shows the theme's solid color
in place of the material while the window is inactive, and restores it on
activation; nothing needs wiring
`"acrylicBase"` and `"acrylicThin"` are
the other two acrylic variants: XAML's `DesktopAcrylicBackdrop` has no kind, so
the window takes `DesktopAcrylicController` as a target instead
(`window.systemBackdrop` reads null; the controller is closed when the backdrop
changes or the window closes)
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
                                // device-independent pixels, 0 before layout
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

Pointing devices are read from Windows.Devices.Input, by the reader `winui-svelte/devices/input` shares (`readInputCapabilities`); where Windows does not tell, the answers are defaults an app can replace:
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
import { ensureSingleInstance, notify } from "winui-svelte/app";

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
The tray polls every 30 ms instead:
`GetCursorPos`, `GetAsyncKeyState` and `Shell_NotifyIconGetRect`, and a click
is a press and a release both over the icon while the pointer is on the taskbar
or the overflow flyout
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
shouldPersist })`, `clear()` and `onChange(callback)` (returns what stops it)
`write` replaces the clipboard's whole content

### Launcher and share

`launchUri(url)`, `launchFile(path)`, `openFolder(path)` and
`revealInExplorer(path)` (starts `explorer.exe /select`, because the Launcher
cannot select an item)
`share({ title, text, html, uri, files })` opens the share pane and throws
`ShareUnavailableError` where Windows has none for the process

What works from an unpackaged process (checked from `node.exe`): the drag and
drop data mapping on real `DataPackage` objects (text, HTML, link, custom
formats, files, folders, a picture), `Clipboard.GetContent` and the Launcher
queries
The share pane does not: `DataTransferManager.GetForCurrentView` fails with
"cannot be called while the app is in the background" without a package
identity (the interop call `GetForWindow` is not in the metadata, so the
bindings cannot make it)
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

## Web APIs (`winui-svelte/web-apis`)

The standard Web APIs over WinRT and Win32, installed on demand; the package
adds no bespoke API for a feature the web already names

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
  `NotFoundError`)
- `HandlerEventTarget` is the `EventTarget` with `onclick`-style properties

### Permissions

`installPermissions()` defines `navigator.permissions`; `Permissions`,
`PermissionStatus` (an `EventTarget` with `change`) and `PermissionStateName`
(`granted`, `denied`, `prompt`) are the spec's; an API registers its permission
with `registerPermission({ name, provider })` and calls
`announcePermissionChange(name)` when it moves, so open statuses fire `change`

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
  The unpackaged fallback (an overlay icon through `ITaskbarList3`) is not
  built; without identity Windows refuses and the call rejects
- `installLaunch({ initialArguments })` defines `launchQueue.setConsumer`
  The start's command line is the first launch; each later copy's is handed
  over with `launchQueue.enqueueActivation(activation)` (WinUI-only), which
  takes what `ensureSingleInstance`'s `onRedirect` receives
  `LaunchParams.targetURL` is the first `scheme:` argument, `files` are the
  existing paths, as handles with `name`, `getFile()` and the WinUI-only `path`
  Launches wait for the consumer; registering the protocol or file type with
  Windows is the installer's job

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
`WriteableBitmap` and `BitmapSource` have no component: the bindings
hold no `WriteableBitmap`, and `BitmapSource` is abstract

| Export | Does |
|---|---|
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
It has no document: there is no `ownerDocument` and no `toDataURL`, and
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
| `drawImage` of an `HTMLImageElement`, `ImageBitmap`, `HTMLVideoElement` or `OffscreenCanvas` | There is no DOM; decode with `loadBitmap`, or draw another `CanvasElement` |
| `toDataURL`, `toBlob`, `transferControlToOffscreen`, `captureStream` | No encoder is exposed on the canvas; `canvas.target.saveAsync` writes a PNG or JPEG file |
| `getContext` of `webgl`, `webgl2`, `bitmaprenderer`; the `alpha`, `desynchronized` and `willReadFrequently` options | One 2D context, always with an alpha channel |
| `scrollPathIntoView` | There is no element tree to scroll; the method is absent |
| `requestAnimationFrame`, `devicePixelRatio`, `document`, `window`, `getComputedStyle` | Globals of a browser; a library that needs them gets them from its host (Node has none) |

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
| `winui-svelte/devices/power` | `battery` |
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
- The WinRT enums the results are made of are re-exported under their own names: `AudioDeviceRole`, `BatteryStatus`, `BluetoothCacheMode`, `BluetoothLEScanningMode`, `DisplayMonitorConnectionKind`, `EnergySaverStatus`, `GamepadButtons`, `NetworkConnectivityLevel`, `NetworkCostType`, `PointerDeviceType`, `PowerSupplyStatus`, `RadioAccessStatus`, `RadioKind`, `RadioState`

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
| `MessagingError`, `MessagingClosedError` | `winui-svelte/messaging` | a handler that threw; a pending send whose link closed |
| `releaseFragment`, `rootControl`, `watchRoot`, `unwatchRoot`, `swapControl` | `winui-svelte/host` | the renderer's mount-target plumbing: release what nodes hold, find the root, watch and unwatch it, replace a control in place |
| `createCssNative`, `installCssRuntime`, `unregisterStyleSheet`, `textTransforms` | `winui-svelte/css` | the CSS runtime's WinUI boundary, its installer, removal of a stylesheet, and the text each element's `text-transform` shows (the renderer reads it) |
| `animationGroups`, `effectGroups`, `visualEffectGroups`, `clipGroups`, `environmentGroups`, `gradientGroups`, `containerGroups`, `compatGroups`, `focusGroups`, `positionGroups`, `queryGroups`, `resourceGroups`, `surfaceGroups`, `transformGroups` | `winui-svelte/css/*` | the property groups each opt-in subpath adds |
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
