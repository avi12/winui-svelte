# winui-svelte: the core's public API

What `src/renderer`, `src/vite` and `src/window` export. Names are fixed once
this file lands; the other parts code against them. Everything is TypeScript
source: `package.json` `exports` point at `.ts` files, so an app in the
monorepo needs no build step (the repository is a pnpm workspace, see
`pnpm-workspace.yaml`).

## Entry points

| Specifier | File | What |
|---|---|---|
| `winui-svelte` | `src/index.ts` | `control`, `withControl`, `elementRef`, `mountControl`, `registerControls`, `setClassHandler`, `dispatch` / `flush` / `onFlush`, the value helpers |
| `winui-svelte/components` | `src/components/generated/index.ts` | every WinUI 3 control as a component (`StackPanel`, `ToggleSwitch`, ...) and its props type (`ToggleSwitchComponentProps`); importing it registers the generated bindings with the renderer |
| `winui-svelte/state` | `src/state/index.ts` | `createHostChannel()` (its `messaging` is the typed link), `hostState()`, `StateProtocol`, the transports (stdio, MessagePort, in-memory), `diff` / `applyOps` (see `src/state/README.md`) |
| `winui-svelte/host` | `src/renderer/host/host.ts` | the custom renderer a compiled component imports (default export); not for app code |
| `winui-svelte/keyed-list` | `src/renderer/list/keyed-list.ts` | `syncKeyed()`: sync a native collection to wanted keys, touching only what changed |
| `winui-svelte/state` | `src/state/index.ts` | `createHostChannel()`, `hostState()`, the transports (see `src/state/README.md`) |
| `winui-svelte/messaging` | `src/messaging/index.ts` | `defineMessaging(transport)`: typed `sendMessage` / `onMessage` over a ProtocolMap, as @webext-core/messaging; the state channel is built on it |
| `winui-svelte/vite` | `src/vite/index.ts` | `winuiSvelte()` Vite plugin, `startModuleServer()`, compile-error formatting |
| `winui-svelte/runner` | `src/vite/runner.ts` | `createWindowModuleRunner()`, the window thread's side of the module server |
| `winui-svelte/compile` | `src/vite/compile.ts` | `compileSvelte()` for bundlers (esbuild) and tests |
| `winui-svelte/testing` | `src/vite/loader.ts` | `svelteHooks()`: Node module hooks that run `.svelte` files with a chosen renderer (pure tests) |
| `winui-svelte/bootstrap` | `src/window/bootstrap.ts` | `initWindowsAppSdk()`; imports nothing of WinRT, safe on the host's main thread |
| `winui-svelte/thread` | `src/window/thread.ts` | `runOnUiThread()`; imports only dynwinrt, so the apartment comes first |
| `winui-svelte/window` | `src/window/index.ts` | `runWindow()`, `exitApplication()`, `createWindow()`, `startTimer()` |

The table is the source layout: `exports` point at `.ts` files so the monorepo
needs no build. `pnpm build` compiles them to `dist/` and `publishConfig`
(which pnpm applies when it packs) points `exports` there, with a
`types` and a `svelte` condition on each.

### The bindings are the package's

The package imports `#winui/*`, which its `package.json` maps to
`dist/bindings`: the WinUI bindings `winapp node generate-bindings` writes,
copied there by `pnpm build` and published whole. They declare
`"sideEffects": false`, and the Vite plugin tells the bundler so, so an app
bundles only the controls it uses. `src/winui.ts` is the package's one import
site; the vite server loads it, and the bindings, through Node (they are
CommonJS). The Windows App SDK bootstrapper ships in `dist/bin`, which
`initWindowsAppSdk()` finds without arguments.

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
function mountControl<Props extends object>(options: { component: Component<Props>; props: Props }): Mounted<Props>;

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
function boxed(text: string): unknown;
function thickness(left: number, top: number, right: number, bottom: number): Thickness;
function starLength(value?: number): GridLength;
function autoLength(): GridLength;
function pixelLength(value: number): GridLength;
```

A removed subtree ends its event subscriptions and lets go of its controls
(`<host element={control}>` controls live on and can be placed again at once).

Raw kebab elements: tag = WinUI class, kebab attribute = camelCase property,
`grid.column={1}` = attached property, `columns` / `rows` on a grid,
`<host element={control} />` places a control made elsewhere,
`ontoggled={handler}` = the event `Toggled`.

A property whose name starts with "on" (ToggleSwitch.OnContent) on a raw
element: Svelte takes any attribute starting with lower-case "on" for an event
(`on-content="x"` is a compile error; `on-content={value}` hands the host a
wrapper that cannot be read). Two forms work: `On-content="On"` (a capital O is
not Svelte's event rule), and `on-content={() => "On"}` (an inline function is
handed over as it is and read once, when the element is made). A property that
changes is set through `{@attach control(...)}`, as components do.

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
// The one line in an app's vite.config.ts: wraps @sveltejs/vite-plugin-svelte
// with the custom renderer, client generation, css "external" (the CSS part
// takes the <style> blocks over), the "browser" resolve condition and the
// window module environment (named "winui").
function winuiSvelte(options?: WinuiSvelteOptions): Plugin[];

interface WinuiSvelteOptions {
  renderer?: string;   // the module a component imports its renderer from; default "winui-svelte/host"
}

// The pure parts, for tests.
function winuiPluginOptions(options?: WinuiSvelteOptions): { svelte: Options; compile: CompileOptions };
function windowConfig(): UserConfig;

// Hot reload inside the window process: a Vite dev server with no HTTP
// server, talking to the module runner over a MessagePort pair.
function startModuleServer(options: {
  root: string;
  port: MessagePort;                       // the runner's counterpart
  configFile?: string;                     // the app's vite.config; without one, winuiSvelte() defaults serve
  isNative?: (file: string) => boolean;    // an app's own native modules (the package's bindings are built in)
  renderer?: string;
}): Promise<ViteDevServer>;

// winui-svelte/runner: the window thread's side. `receive()` is called from a
// DispatcherQueue timer; a hot update that cannot be applied is reported and
// the window goes on.
function createWindowModuleRunner(port: MessagePort): { runner: ModuleRunner; receive(): void };
```

Compile errors: a `.svelte` file that does not compile is printed on the host
process's stderr as `file:line:column: message [code]` and its code frame (at
start, the process then ends with that as its reason; on a hot update, the
window keeps running with the code it has, and the next good save applies).
`describeError()` / `compileDiagnostic()` / `formatDiagnostic()` are exported
for tools; `compileSvelte()` throws an `Error` with that message.

## Window (`winui-svelte/bootstrap`, `/thread`, `/window`)

```ts
// bootstrap: finds Microsoft.WindowsAppRuntime.Bootstrap.dll in `folders` (first
// match wins), sets WINAPPSDK_BOOTSTRAP_DLL_PATH and initialises the Windows
// App SDK. Throws WindowsAppRuntimeMissing when the runtime is not installed.
function initWindowsAppSdk(options?: { major?: number; minor?: number; folders?: string[] }): void;

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
  backdrop?: Backdrop;                        // "acrylic" | "mica" | "micaAlt" | "none"
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
calls `runWindow`. A transport (JSON lines on stdio, a MessagePort) is not in
these files: it is `src/state`'s, which uses `dispatch` to put host messages
on the UI thread. `examples/counter` is the working example (its `launch.ts`
is the host, its `window.ts` the UI-thread worker).

## Components that show items (`winui-svelte/components`)

A control that shows its items from a data source is generated like the rest,
with `items`, `key` and `item` in place of its children and items source: the
table `itemsHosted` in `scripts/codegen/tables.ts` names them and the host each
uses (`src/components/hand-written/items`). `ListView` and `GridView` report their
containers; `ItemsRepeater`, `ItemsView` and `BreadcrumbBar` keep their items in an
`ItemsRepeater`, whose elements the host fills. Every other property, event and
snippet slot of the control is the generated component's. `Window` is not a
control (it is no UIElement), so it is only in `hand-written/` and
`components/index.ts`.

A control whose items are controls (`ComboBox`, `FlipView`, `NavigationView`,
`TabView`, `RadioButtons`, `ListBox`...) takes them as children, so Svelte's own
blocks are its item template: `{#each rows as row (row.id)}<ComboBoxItem content={row.name} />{/each}`
keeps, adds, moves and removes items as the array changes. `TreeView` takes
`TreeViewNode` children the same way.

Value objects (brushes, geometry, transforms, transitions, animations,
layouts, icon and image sources, keyboard accelerators, commands, backdrops)
are components too, and fill the property they are written in:

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
`{@attach control(storyboard => storyboard.begin())}`.

### ListView and GridView

```svelte
<ListView items={rows} key={row => row.id} reorderable keyboardReorder
          onReorder={ids => save(ids)} itemName={row => row.name}
          onControl={view => animate(view)} bind:handle>
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
| `onReorder` | `(keys: string[]) => void`, after a drag or a keyboard move, the keys in the order the user left. The list keeps that order until `items` changes |
| `itemName` | the accessible name of an item's container |
| `onControl` | `(view) => void \| cleanup`: the `ListViewBase` itself, for what the component does not cover (item transitions) |
| `bind:handle` | `ListHandle`: `move(key, direction)` (what Alt+Up/Down does), `scrollToKey(key)`, `focus(key)` |

Every other property and event of the control is a prop as on the generated
components (`selectionMode`, `itemContainerStyle`, `onDragItemsCompleted`, ...);
`itemsSource`, `itemTemplate`, `items` and `children` are the component's.

How it works: the control's items are a vector of **boxed keys** (the
control's drag reorder only commits a move to a list of plain values, not of
rows), its item template is a `ContentControl` slot, and each time a container
reports the key it shows (`ContainerContentChanging`) the `item` snippet is
mounted into the slot (`mountControl`); a container going to the recycle queue
ends its row. So a 1000 item list holds the rows of the containers WinUI has
realized (a screenful and its cache, about 76 for a 640 pixel window), not
1000, and nothing leaks (`test/lists.test.ts` counts rows made and ended). Rows
are mounted outside the list's own component tree: they do not see its Svelte
context. The key sync touches only keys that came, went or moved (an empty
list is filled in one reset), so the control's item transitions play for
exactly those.

### Window

```svelte
<Window title="My app" backdrop="acrylic" icon={iconPath} appUserModelId={id}
        width={560} minWidth={560} maxWidth={560} minHeight={420} height={640}
        isMaximizable={false} placement={saved} activate={!isBackground}
        onActiveChanged={refresh} onBoundsChanged={report} onClosed={exitApplication}
        bind:handle>
  {#snippet titleBar()}...{/snippet}
  ...the page...
</Window>
```

Mount it as the app's root (`mountControl({ component: App, props })` inside `runWindow`'s
`onStart`): the component is the window. `backdrop` is `"acrylic"`, `"mica"`,
`"micaAlt"` or `"none"` (`Backdrop`, also taken by `createWindow`); it can
change while the window is open. A `titleBar` snippet is shown above the content
and set as the window's title bar (`setTitleBar`, so it is the drag region and
the controls in it still click); it makes `extendsIntoTitleBar` true unless
given. Sizes are in device-independent pixels (the window's DPI applied);
`placement` is in device pixels (a position, and optionally a size) and wins over
centering, which is the default. `activate={false}` shows the window without
taking focus. `onBoundsChanged` hears the bounds the window opened with and
then every move or resize (device pixels), so an app that reopens the window
where it was has them before the user touches it. `bind:handle` gives a `WindowHandle`: `window`, `appWindow`,
`presenter`, `scale`, `close()`, `restore()`, `minimize()`, `maximize()`,
`bringToFront()`. `appUserModelId` names the process for the taskbar (it is
process-wide: read once, before the window opens).
