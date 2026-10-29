# winui-svelte: the core's public API

What `src/renderer`, `src/vite` and `src/window` export. Names are fixed once
this file lands; the other parts code against them. Everything is TypeScript
source: `package.json` `exports` point at `.ts` files, so an app in the
monorepo needs no build step (the repository is a pnpm workspace, see
`pnpm-workspace.yaml`).

## Entry points

| Specifier | File | What |
|---|---|---|
| `winui-svelte` | `src/index.ts` | `control`, `withControl`, `elementRef`, `elementSize`, `elementTheme`, `focusElement`, `mountControl`, `registerControls`, `setClassHandler`, `dispatch` / `flush` / `onFlush`, the value helpers |
| `winui-svelte/components` | `src/components/generated/index.ts` | every WinUI 3 control as a component (`StackPanel`, `ToggleSwitch`, ...) and its props type (`ToggleSwitchComponentProps`); `xamlOf`, `goToState`, `installXaml`, `resourceDictionaryOf`; importing it registers the generated bindings with the renderer |
| `winui-svelte/state` | `src/state/index.ts` | `createHostChannel()` (its `messaging` is the typed link), `hostState()`, `StateProtocol`, the transports (stdio, MessagePort, in-memory), `diff` / `applyOps` (see `src/state/README.md`) |
| `winui-svelte/host` | `src/renderer/host/host.ts` | the custom renderer a compiled component imports (default export); not for app code |
| `winui-svelte/element-animation` | `src/renderer/host/element-animation.ts` | `enableElementAnimation()`, and the attachments `transition()`, `intro()`, `outro()`: Svelte's transition functions on WinUI elements (opt-in; an app that does not import it does not bundle it) |
| `winui-svelte/keyed-list` | `src/renderer/list/keyed-list.ts` | `syncKeyed()`: sync a native collection to wanted keys, touching only what changed |
| `winui-svelte/state` | `src/state/index.ts` | `createHostChannel()`, `hostState()`, the transports (see `src/state/README.md`) |
| `winui-svelte/messaging` | `src/messaging/index.ts` | `defineMessaging(transport)`: typed `sendMessage` / `onMessage` over a ProtocolMap, as @webext-core/messaging; the state channel is built on it |
| `winui-svelte/vite` | `src/vite/index.ts` | `winuiSvelte()` Vite plugin, `startModuleServer()`, compile-error formatting |
| `winui-svelte/runner` | `src/vite/runner.ts` | `createWindowModuleRunner()`, the window thread's side of the module server |
| `winui-svelte/compile` | `src/vite/compile.ts` | `compileSvelte()` for bundlers (esbuild) and tests |
| `winui-svelte/testing` | `src/vite/loader.ts` | `svelteHooks()`: Node module hooks that run `.svelte` files with a chosen renderer (pure tests) |
| `winui-svelte/bootstrap` | `src/window/bootstrap.ts` | `initWindowsAppSdk()`; imports nothing of WinRT, safe on the host's main thread |
| `winui-svelte/thread` | `src/window/thread.ts` | `runOnUiThread()`; imports only dynwinrt, so the apartment comes first |
| `winui-svelte/window` | `src/window/index.ts` | `runWindow()`, `exitApplication()`, `createWindow()`, `startTimer()`, `systemSettings()`, the picker options (see App services) |
| `winui-svelte/app` | `src/app/index.ts` | `ensureSingleInstance()`, `notify()` (opt-in; see App lifecycle) |

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
CommonJS). The Windows App SDK bootstrapper ships in `dist/bin/<arch>` (with
WebView2's native libraries), which `initWindowsAppSdk()` finds without
arguments. `pnpm bindings` makes the bindings: winapp's run, then WebView2's
(see below).

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
(`<host element={control}>` controls live on and can be placed again at once).

Raw kebab elements: tag = WinUI class, kebab attribute = camelCase property,
`grid.column={1}` = attached property, `columns` / `rows` on a grid,
`<host element={control} />` places a control made elsewhere,
`ontoggled={handler}` = the event `Toggled`.

`<property name="childrenTransitions" collection="transition-collection">`
fills a property WinUI leaves null with a collection: when the property holds
none and the element has a control in it, the renderer makes the class the
`collection` tag names (registered through `registerControls`, as the
transition components do) and sets it, then fills it as any collection. The
generated components write this for `transitions`, `childrenTransitions`,
`childTransitions`, `contentTransitions`, `itemContainerTransitions`,
`headerTransitions` and `footerTransitions` (`createdCollections` in
`scripts/codegen/tables.ts`), which are snippet props in place of the
properties, and each transition component registers `TransitionCollection`.

A property whose name starts with "on" (ToggleSwitch.OnContent) on a raw
element: Svelte takes any attribute starting with lower-case "on" for an event
(`on-content="x"` is a compile error; `on-content={value}` hands the host a
wrapper that cannot be read). Two forms work: `On-content="On"` (a capital O is
not Svelte's event rule), and `on-content={() => "On"}` (an inline function is
handed over as it is and read once, when the element is made). A property that
changes is set through `{@attach control(...)}`, as components do.

## Transitions (`winui-svelte/element-animation`)

Svelte's compiler refuses `transition:`, `in:`, `out:` and `animate:` when
it draws through a custom renderer (`incompatible_with_custom_renderer`: they
drive the DOM's `Element.animate()`). The same transition functions
(`svelte/transition`'s `fade`, `fly`, `scale`, `blur`, or your own) are
played by attachments instead:

```svelte
<script lang="ts">
  import { transition } from "winui-svelte/element-animation";
  import { fly } from "svelte/transition";
</script>

{#if isShown}
  <Border {@attach transition({ use: fly, params: { y: 40, duration: 300 } })}>
    ...
  </Border>
{/if}
```

```ts
// Once, before the first component is mounted (in start(), before
// mountControl). Returns what turns it off again.
function enableElementAnimation(options?: {
  clock?: AnimationClock; // default: the UI thread's dispatcher timer, ~16 ms
  onFrame?: () => void; // default: flush()
  warn?: (message: string) => void; // default: console.warn
}): () => void;

// `use` is a transition function; `params` is what it is given.
function transition(options: { use: TransitionFunction<P>; params?: P }): Attachment; // transition:
function intro(options: { use: TransitionFunction<P>; params?: P }): Attachment; // in:
function outro(options: { use: TransitionFunction<P>; params?: P }): Attachment; // out:
```

What it does:

- A transition's `css(t, u)` is read with the CSS value parsers into the
  control's `Opacity`, `Translation`, `Scale` and `Rotation` (`opacity`,
  `translate`, `scale`, `rotate`, and `transform` with `translate`, `scale`
  and `rotate` functions), stepped about every 16 ms; `tick(t, u)` runs on each
  frame. Scale and rotation turn about the middle of the control, and the
  control's own values come back when the transition ends.
- An element Svelte removes with an outro stays in its parent, out of reach
  (`IsHitTestVisible` false), until the outro has run: `enableElementAnimation`
  makes the renderer's `remove` wait. Only an element Svelte removes itself
  leaves this way (the root of its `{#if}` or `{#each}` block, not one inside a
  block that goes). Showing it again makes a new element; the old one still
  leaves.
- An intro plays when the element is made, also with its component (Svelte's
  `transition:` skips the first render). Gate what you do not want animated
  at start with an `{#if}`.
- A property WinUI cannot animate (`height`, `padding`, `filter`, ...) is
  named once through `warn` and left out, so `slide` fades but does not
  collapse. A transition that returns a function (`crossfade`) is called at once.
- The attachment also works on a component (`<Border {@attach ...}>`): a
  component spreads the attachments written on it onto its element.
- `getComputedStyle` is defined as a global for WinUI's elements (the
  functions of `svelte/transition` call it); any other argument goes to the
  one that was there, if any.
- `animate:flip` has no equivalent. WinUI's own `RepositionThemeTransition`
  is the native tool for a moved element (not tried here).

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

## Value props (`winui-svelte/components`)

A prop whose WinUI type is a value struct or a collection of them takes an
input a person writes, and the component converts it
(`src/components/convert.ts`, parsed by `src/components/values.ts`, which
needs no WinUI). WinUI's own value is always accepted as well, so a value read
from a control can be written back. Which converter a type gets is the table
`kindOfType` in `scripts/codegen/tables.ts` (`nullableKindOfType` for
`IReference<T>`); the emitter reads the converter, input type and read-back of
each kind from one table in `scripts/codegen/emit.ts`.

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
| `ImageSource` | `ImageSourceInput` | a URI; `.svg` makes an `SvgImageSource` |
| an `itemsSource` | `CollectionInput` | an array, made an `IVector` of boxed items |

The nullable ones (`beginTime`, `selectedDate`, ...) take `null` as well. A
bindable `date` or time reads back as a `Date` or as milliseconds. For an event
argument, `ticksDate(ticks)` and `ticksMilliseconds(ticks)` from
`winui-svelte/components` turn WinUI's ticks (`args.newDate.universalTime`,
`args.newTime.duration`) into the same.

## Templates, styles and resources (`winui-svelte/components`)

A prop typed with a WinUI template takes XAML text; a `*Style` prop takes CSS
class names; `resources` takes a record. Each also takes WinUI's own object
(a `ControlTemplate`, a `Style`, a `ResourceDictionary`), so a value read
from a control can be written back. The kind of each prop is read from its type
(`kindOfType` in `scripts/codegen/tables.ts`), and the converter and input
type of each kind come from the table in `scripts/codegen/emit.ts`.

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
    <TextBlock text={row.name} />
  {/snippet}
</ListView>

<ItemsControl itemsSource={names} itemsPanel="<ItemsPanelTemplate>
  <StackPanel Orientation='Horizontal'/></ItemsPanelTemplate>"
  itemTemplate="<DataTemplate><TextBlock Text='{Binding}'/></DataTemplate>" />
```

`ListView`, `GridView`, `ItemsRepeater`, `BreadcrumbBar` and `ItemsView` show
their items by a snippet and own their item template; the other items
controls (`ItemsControl`, `ComboBox`, `TreeView`, ...) take `itemTemplate`.

```ts
xamlOf({ kind: XamlKind, xaml }): ControlTemplate | DataTemplate | ...
goToState({ control, name, useTransitions = false }): boolean
installXaml(): void
resourceDictionaryOf(record: ResourceRecordInput): ResourceDictionary
```

- **`xamlOf`** loads XAML text through `XamlReader` as the kind named by
  `XamlKind` (`controlTemplate`, `dataTemplate`, `itemsPanelTemplate`,
  `style`, `resourceDictionary`) and returns the class, to keep and give to
  several props. The root element must be the kind's (a `RangeError` names the
  kinds, a `TypeError` the root it found), and a root that declares no
  `xmlns` or `xmlns:x` gets WinUI's, so a template is written without them.
  `src/components/xaml-source.ts` checks the text and needs no WinUI.
- **A prop given XAML text** loads it the same way. The components reach the
  reader through a seam (`src/components/xaml-seam.ts`), so an app that
  writes no template does not bundle `XamlReader` or the template classes:
  `runWindow` installs it when the application starts, and a host of one's own
  (a test that creates the application itself) calls `installXaml()` once.
  Without it a string throws, saying so.
- **A `*Style` prop given class names** gets the Style the `<style>` rules
  for those classes make for the element the prop styles
  (`styleOfClasses` in [`src/css/API.md`](src/css/API.md)). WinUI does not say
  which element that is, so `src/components/style-targets.ts` does: the button
  of `closeButtonStyle`, the `TextBox` of `textBoxStyle`, and for
  `itemContainerStyle` the container of the control (`ListViewItem` for a
  `ListView`, `GridViewItem`, `ComboBoxItem`, `FlipViewItem`,
  `TreeViewItem`; a control not listed takes a `Style` object). The
  generator refuses a Style prop that table lacks. The rule is written
  `:global(.row)`, since Svelte scopes no class passed to a component. The Style is built when the
  prop is set and states are ignored; a class no rule matches, or one that
  sets what only an element holds (a grid's columns, the focus ring, a custom
  property), throws. `FrameworkElement.Style` stays skipped: `style` is the CSS
  string of the element.
- **A `resources` record** maps resource keys to values. A key is a custom
  property's name (`"--button-background"`, the form a stylesheet uses) or the
  resource's own (`ButtonBackground`).
  A color or a length keeps the kind its key has in WinUI, by the rule CSS
  custom properties follow (`entriesForKey`, `src/css/translate/variables.ts`): a
  Brush key such as `ButtonBackground` gets a `SolidColorBrush`, a Thickness
  key (`ButtonPadding`) one length on every side, a CornerRadius key a
  `CornerRadius`, any other number a `Double`; a key WinUI does not define
  is a `Color` with a `Brush` of the same name plus `Brush`. A key is
  spelled as WinUI spells it whatever case it is written in. Text for a text or
  font family key, a boolean, and a WinRT object (a brush, a style) are put in
  as they are. A value of another kind than its key's throws with the key and
  its kind. The record becomes the element's whole `Resources` (as
  `<Button.Resources>` does); the kinds come from `winui-resources.g.json`,
  read the first time a record is given. The prop does not combine with a class
  whose custom properties are merged into the same element's resources.
- **`goToState`** is `VisualStateManager.GoToState`: it enters a state the
  control's template defines (`Pressed`, `PointerOver`) and returns whether
  it did. The template must be applied (`control.applyTemplate()`, or the
  control shown).

`VisualStateGroup`, `VisualState`, `Setter`, `AdaptiveTrigger` and
`StateTrigger` are not components: `Setter`, `AdaptiveTrigger` and
`StateTrigger` are not in the bindings, and a state group is written inside a
template (XAML text) rather than among a control's children.

## Components that show items (`winui-svelte/components`)

A control that shows its items from a data source is generated like the rest,
with `items`, `key` and `item` in place of its children and items source: the
table `itemsHosted` in `scripts/codegen/tables.ts` names them and the host each
uses (`src/components/hand-written/items`). They are `ListView`, `GridView`,
`ItemsRepeater`, `ItemsView`, `BreadcrumbBar` and `TreeView`. `ListView` and
`GridView` report their containers (and take the list props below); `TreeView`
reports the containers of the list inside it (and takes the tree props below);
the other three keep their items in an `ItemsRepeater`, whose elements the host
fills, and take `items`, `key` and `item` only. Every other property, event and snippet slot
of the control is the generated component's. `Window` is not a control (it is
no UIElement), so it is the one component only in `hand-written/` and
`components/index.ts`.

A control whose items are controls takes them as Svelte's own blocks, which are
its item template: `{#each rows as row (row.id)}<ComboBoxItem content={row.name} />{/each}`
keeps, adds, moves and removes items as the array changes. They are the
children of `ComboBox`, `FlipView` and `ListBox`, and the snippet that names
the property in `NavigationView` (`menuItems`, `footerMenuItems`), `TabView`
(`tabItems`) and `RadioButtons` (`items`). A `TreeView` takes its items by
`items` and `children` instead (below), not as `TreeViewNode` blocks.

Value objects are components too, and fill the property they are written in.
They are the brushes, geometry, transforms, transitions, animations (with key
frames and easing), layouts, commands, keyboard accelerators, backdrops, icon
and image sources, shadows, projections and tree nodes: the roots in
`rootClasses` in `scripts/codegen/tables.ts`, each with every class below it. A
root that can be made is a component itself (`GradientStop`). A snippet takes
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
`{@attach control(storyboard => storyboard.begin())}`.

A gradient background can also be written in CSS (`background-image:
linear-gradient(...)` in a `<style>`), which the build turns into the same
brushes; see "Gradients" in `src/css/API.md`.

### WebView2

`<WebView2 source="https://..." onNavigationCompleted={...} />` is generated
like the rest. Its bindings are made by `pnpm bindings` after winapp's run
(`scripts/bindings/after-winapp.ts`), since winapp gives the code generator no
WebView2 Core metadata (about 3 MB of bindings). That step also restores
`Microsoft.Web.WebView2.Core.dll`, and the build ships it with
`WebView2Loader.dll` in `dist/bin/<arch>`: `initWindowsAppSdk` puts that
folder on `PATH`, since the control loads both by name and node.exe's own folder
has neither. It also points `WEBVIEW2_USER_DATA_FOLDER` at
`%LOCALAPPDATA%\winui-svelte\<main script>\WebView2` (the `webViewUserDataFolder` option; a
variable already set wins), because the default folder is beside node.exe in Program Files,
which is not writable, and the browser would not start. A page loads as it
does in any WinUI app, except that WebView2 blocks a `data:` URL as the top
frame. `test/web.test.ts` loads one in a real window; it needs an ordinary
desktop session (a sandboxed process cannot launch the browser, 0x8007139F).

### ListView and GridView

```svelte
<ListView items={rows} key={row => row.id} reorderable keyboardReorder
          onReorder={ids => save(ids)} itemName={row => row.name}
          onControl={view => animate(view)} bind:handle bind:selectedKey>
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
| `groupBy` | `(item) => string`: shows the items in groups (see "Groups" below) |
| `groupHeader` | the header row snippet of a group, given the `Group` (`{ key, items }`) |
| `bind:selectedKey` | `string \| undefined`: the key of the selected item (for the single selection modes). Set it to select an item, read it for the user's choice; it is cleared when the item goes and follows the item when the items reorder |
| `bind:selectedKeys` | `string[]`: the keys of the selected items in list order, for `Multiple` and `Extended` (`selectedKey` is then the first of them) |
| `bind:handle` | `ListHandle`: `move(key, direction)` (what Alt+Up/Down does), `scrollToKey(key)`, `focus(key)` |

Every other property and event of the control is a prop as on the generated
components (`selectionMode`, `itemContainerStyle`, `onDragItemsCompleted`, ...);
`selectedIndex` is an index into `items` and is as good as a key, but the
control's `selectedItem` and `selectedValue` hold the **boxed key**, not the
item (read one with `unboxed`; setting them does not select, use
`selectedKey`).
`itemsSource`, `itemTemplate`, `items` and `children` are the component's.
`ItemsView` has no `selectedKey` yet.

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

#### Groups

```svelte
<ListView items={rows} key={row => row.id} groupBy={row => row.city}>
  {#snippet item(row)}<RowView {row} />{/snippet}
  {#snippet groupHeader(group)}<text-block>{group.key} ({group.items.length})</text-block>{/snippet}
</ListView>
```

`groupBy` arranges the items by a group key: groups follow each other in the
order their first item appears, each group's items in the order of `items`.
Each group's header is a row of its own before its items (the control's items
are the keys of both, so a group's header is one of them), shown with the
`groupHeader` snippet. A header cannot be selected or focused (its container is
disabled, so the theme's disabled foreground applies unless the snippet sets
its own), and `reorderable` and `keyboardReorder` are ignored in a grouped
list. `selectedKey`, `onReorder`'s keys and `itemName` only ever hold items. It
is not WinUI's own grouping (`CollectionViewSource.IsSourceGrouped` with a
`GroupStyle`): that needs `CollectionViewSource` and a JavaScript object that
implements `ICollectionViewGroup`, neither of which the bindings have, and
gives a header that sticks to the top of the list, which a header row does not.

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
| `onControl` | `(view) => void \| cleanup`: the `TreeView` itself |

Every other property and event of the control is a prop as on the generated
components. `rootNodes`, `selectedNode`, `selectedNodes`, `selectedItem`,
`itemsSource` and `itemTemplate` are the component's, and so is `children`
(which is not Svelte's snippet here). The control's own drag reorder is not
supported: a move it makes is undone by the next sync of `items`.

How it works: the control's nodes are `TreeViewNode`s whose content is the
item's **boxed key**, so every node a tree needs is made from the items, not
by the app. A node's children are made only when the node is expanded (its key
is in `expandedKeys`) or already were: a collapsed node with children says it
has some it has not made (`hasUnrealizedChildren`) and `children(item)` is
called to know it, and the control's `Expanding` event, which it raises for the
user's click and for the app's `isExpanded` alike, has them made while it
asks. So a tree that is mostly closed holds nodes for what is open, and a
node that is closed after it was open keeps its children, in step with the
items. A node is kept for as long as its item stays under the same parent, so
a reorder, an insertion or a removal changes exactly those nodes (an item that
moves to another parent is a new node, and keeps its expanded state through
its key). Rows work as in the list: the control draws its nodes in a
`ListView` of its own (the part `ListControl`), which reports each container it
realizes, and the `item` snippet is mounted into that container's slot and
ends when the container is recycled (`test/tree.test.ts`: 2000 roots hold the
rows of about 90 containers).

Selecting is by key as in the list, with one difference: only the items whose
node is made can be selected, so a key whose parent was never opened is not a
selection and is dropped from `selectedKey`; put its ancestors in
`expandedKeys` first. `selectedItem` is not bindable on a `TreeView`: it holds
the control's own nodes, and binding it undoes the key selection.

### Window

```svelte
<Window title="My app" backdrop="acrylic" icon={iconPath} appUserModelId={id}
        width={560} minWidth={560} maxWidth={560} minHeight={420} height={640}
        isMaximizable={false} placement={saved} activate={!isBackground}
        onActiveChanged={refresh} onBoundsChanged={report}
        onClosing={hasUnsavedWork} onClosed={exitApplication} theme="dark"
        titleBarHeight="tall" captionButtons={{ foreground: "#fff" }}
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
where it was has them before the user touches it.
`onClosing` runs when the window is asked to close (the close button, Alt+F4,
`handle.close()`): returning `true` keeps it open (ask the user, then close it
again from code); `onClosed` follows a close that went through.
`onScaleChanged(scale)` hears a DPI change (the window moved to another
display, or the user changed the display scale); the size limits and regions,
which WinUI takes in device pixels, are set again for it.

`theme` is `"light"`, `"dark"` or `"system"` (the default): it sets the
content's requested theme and the caption buttons'. `titleBarHeight` is
`"standard"` or `"tall"` (for a title bar that holds a search box or tabs; it
applies when the content extends into the title bar). `captionButtons` sets
the colors of the minimize, maximize and close buttons: `foreground`,
`background`, `hover*`, `pressed*` and `inactive*` (each `Foreground` or
`Background`), as `"#rgb"`, `"#rrggbb"`, `"#aarrggbb"` or `"transparent"` (the
parser a color prop uses; other text throws a `TypeError`). A color left out,
or dropped later, is the system's.

`dragRegions` and `passthroughRegions` are rectangles (`{ x, y, width, height }`
in device-independent pixels from the window's top-left corner) that set
InputNonClientPointerSource's caption and passthrough regions: where a press
drags the window, and the parts of it (a search box) that take the pointer
themselves. Without `dragRegions` the `titleBar` snippet is the drag area.

`presentation` is `"windowed"` (the default), `"fullScreen"` or
`"compactOverlay"` (a small always-on-top window). The size limits and
`isAlwaysOnTop` are the windowed presentation's, and are set again when the
window returns to it. `owner` (another window's `WindowHandle`) and `isModal`
(blocks the owner until this window closes) are read once, before the window
opens; `createWindow` takes them too. The `owner` link is a Win32 call
(`SetWindowLongPtrW`) in `native.ts`.

`bind:handle` gives a `WindowHandle`: `window`, `appWindow`,
`presenter`, `scale`, `close()`, `restore()`, `minimize()`, `maximize()`,
`bringToFront()`, and the file dialogs `pickFile()`, `pickFiles()`,
`pickFolder()` and `saveFile()` (see App services). `appUserModelId` names the
process for the taskbar (it is process-wide: read once, before the window
opens).

## Page navigation (`winui-svelte/components`)

`Frame.SourcePageType` takes a page type XAML registered, which a Node host
cannot give it. `Navigator` (`src/components/hand-written/navigation`) does
what a `Frame` does with Svelte components as the pages: it mounts the page
into a `ContentControl`, keeps the back and forward history, and lets the
control's navigation transition play when the page changes.

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
<Button disabled={!navigator?.canGoBack} onClick={() => navigator?.goBack()}>Back</Button>
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

- Props of the component: `bind:handle`; `onReady(handle)`, called once the
  control is in place, where the first page is navigated to;
  `onNavigated({ entry, mode })`, with `mode` a `NavigationMode` (`new`,
  `back`, `forward`); `cacheSize` (default 10); `transition`, a snippet with
  one of the `...NavigationTransitionInfo` components (it is the
  `DefaultNavigationTransitionInfo` of the control's `NavigationThemeTransition`;
  `SuppressNavigationTransitionInfo` plays none); and the props of
  `ContentControl`, except those the navigator owns (`content`,
  `contentTransitions`, `contentTemplate`).
- A page is a plain component; its props are the `params`. It is made when
  the user goes to it and ends (its effects and controls) when the cache lets
  it go, as an items row does.
- `NavigationCacheMode` is WinUI's: `DISABLED` (the default) ends the page
  when the user leaves it, so going back makes a new one; `ENABLED` keeps it
  mounted, with its state, while it is among the `cacheSize` most recently
  shown enabled pages; `REQUIRED` keeps it for as long as the history holds
  it. A page keeps its place in the history by entry, not by component:
  navigating to the same component twice makes two entries, each with its own
  page.
- A new `navigate` after `goBack` drops the pages that were forward, and ends
  the ones of them that were kept.
- With a `NavigationView`, put the navigator in the view's content, go to the
  page of the chosen item in `onSelectionChanged`, go back in
  `onBackRequested`, and select the item of `handle.current` when the history
  moves; `examples/navigation` does this.

## Overlays (`winui-svelte/components`)

A control that opens over the window takes `open` and `target` (and a dialog
`onResult`) besides its own props; the table `overlayHosted` in
`scripts/codegen/tables.ts` names them and the host each uses
(`src/components/hand-written/overlay`). They are `ContentDialog`, and the
flyouts: `Flyout`, `MenuFlyout`, `MenuBarItemFlyout`, `CommandBarFlyout`,
`TextCommandBarFlyout`, `DatePickerFlyout`, `TimePickerFlyout`,
`PickerFlyout` and `ListPickerFlyout`.

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
    onResult={result => result === ContentDialogResult.Primary && remove()}
  >This cannot be undone.</ContentDialog>
</StackPanel>
```

- `open` (`bind:open`) is `true` while the control is open. Setting it opens
  or closes the control; the user closing it (light dismiss, Escape, a choice,
  the dialog's buttons) sets it back to `false`. Left unset, nothing opens.
- `target` is the element the control opens next to: a flyout through
  `ShowAt`, a dialog in that element's window (its `XamlRoot`). It defaults to
  the element the control is written in (`placedControl`): the `Button` whose
  `flyout` snippet holds it, or the panel it is a child of. A control written
  directly in the window's content has no element above it, so give it
  `target`. A flyout is no element, so a panel leaves it out of its children.
- An overlay asked to open before its element is on screen opens when the
  element loads, and not at all when closed first. One still open when its
  component goes is closed.
- `onResult(result)` of a `ContentDialog` gets the button the user chose
  (`ContentDialogResult.Primary`, `Secondary`) and `None` for the close
  button, Escape and `open = false`. `onClosed` and the control's other events
  are the generated ones.
- WinUI shows one `ContentDialog` at a time (a second `ShowAsync` fails with
  0x80000019). Dialogs asked for together open in the order asked, each when
  the one before has closed; `open` stays `true` while one waits, and setting it
  to `false` first removes it from the line. The line is one for the thread, so
  a dialog of a second window also waits.
- `Flyout`'s content is a control: write `<TextBlock>` in it, not bare text.

## Value objects, attached slots and observed state (`winui-svelte/components`)

### Value objects

Classes that are no element but hold what an element shows are components too.
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
    <SwipeItems mode="Execute">
      <SwipeItem text="Delete" onInvoked={remove} />
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
  `insertAt` and no other place for them into it.
- `TextHighlighter.ranges` is hand-written
  (`src/components/extensions/text-highlighter.ts`): WinUI's `Ranges` is a
  read-only collection of structs. The array replaces the ranges it holds.
- `MapControl.layers` is settable, so the snippet fills the collection the map
  holds when it holds one.

Not components, on purpose: `GroupStyle` (it is not a `DependencyObject`, only
templates and styles, and the lists do not group), the scroll snap points
(`ScrollSnapPoint`, `RepeatedScrollSnapPoint`, ...: their factories take
arguments, so none has a default constructor), and the visual state, trigger
and setter families.

### Attached slots

An attached property whose value is a control takes a snippet as well
(`slots` of `attachedOwners`):

- `toolTip` (every element): `{#snippet toolTip()}<TextBlock>Save</TextBlock>{/snippet}`.
  A string, number or boolean prop works as before.

The component renders a `<property name="tool-tip-service.tool-tip">`
element; a property element named `owner.property` fills the attached property
through the owner's `set<Property>`, as the attribute of that name does, and
gives it back (`null`) when it goes. The component registers the owner, so no
app code does.

`FlyoutBase.AttachedFlyout` has no prop of its own: a prop of every framework
element would add `FlyoutBase` (a binding module) and a snippet block to every
component, more than the one-Button bundle budget allows. Use the `attached`
prop: `attached={[FlyoutBase, "AttachedFlyout", flyout]}`.

The animation target is attached on every timeline: `storyboardTarget`,
`storyboardTargetName` and `storyboardTargetProperty` call
`Storyboard.SetTarget`, `SetTargetName` and `SetTargetProperty`.

### Observed state

Read-only state WinUI reports by an event is a bindable prop the control
writes and the app only reads. It holds the control's value as soon as the
control is made, and follows each time the event is raised; what the prop is
given is never written to the control. The table is `observedProperties` in
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
`actualTheme`, `isLoaded`), which would put a subscription in every component.

### Bindings for the next features

`featureClasses` in `scripts/codegen/tables.ts` lists the classes `pnpm bindings`
makes though nothing in `src/` imports them yet: `FullScreenPresenter`,
`CompactOverlayPresenter`, `DesktopAcrylicController`, `MicaController`,
`SystemBackdropConfiguration`, the Windows App SDK `FileSavePicker`,
`AppNotificationManager`, `AppNotification` and its builders, `AppInstance`,
`ConnectedAnimationService`, `InMemoryRandomAccessStream`, `DataWriter` and
`MediaSource`.

## App services (`winui-svelte`, `winui-svelte/window`)

What an app reads from Windows and asks of it, beyond controls. All of it
runs on the UI thread, unpackaged (started from `node.exe`), except what the
last two lists say.

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
`@attach control(...)`. Focus lands only once the control is shown, in an
active window: a call earlier returns `false`.

### System settings (`winui-svelte/window`)

```ts
const settings = systemSettings();   // once, on the UI thread
settings.accentColor;       // "#rrggbb": any color prop takes it
settings.textScaleFactor;   // 1 is 100%, 1.5 is 150%
settings.isAnimationEnabled;
settings.isHighContrast;    // a contrast theme is on
```

Over `Windows.UI.ViewManagement.UISettings`. Each field is read live and is
reactive: it updates on `ColorValuesChanged`, `TextScaleFactorChanged` and
`AnimationsEnabledChanged` (and `HighContrastChanged` of
`Windows.UI.ViewManagement.AccessibilitySettings`, for `isHighContrast`), and
the subscription lasts only while an effect
reads it. `UISettings` raises its events off the UI thread, so the change is
handed to it through a dispatcher captured when `systemSettings()` is called.

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
`WindowId` (`appWindow.id`) so the dialog opens over that window. The older
`Windows.Storage.Pickers` classes need an `IInitializeWithWindow` call and are
not used. All take `PickerOptions`: `title`, `commitButtonText`, `startIn`
(`documents`, `computer`, `desktop`, `downloads`, `music`, `pictures`,
`videos`), `startFolder` (a path, wins over `startIn`) and `settingsIdentifier`
(dialogs sharing it open where the user last chose). The dialog is modal to
its window; the promise settles when it closes. A path is all that comes back:
read and write the file with `node:fs`.

### App lifecycle (`winui-svelte/app`)

```ts
import { ensureSingleInstance, notify } from "winui-svelte/app";

const single = await ensureSingleInstance({
  key: "com.example.notes",
  onRedirect: ({ commandLine }) => openFile(commandLine),
});
if (!single.isPrimary) {
  exitApplication();   // its activation was handed to the first copy
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

An opt-in subpath: an app that does not import it does not bundle it.

- `ensureSingleInstance` is `AppInstance.FindOrRegisterForKey`: the first copy
  to register the key is the primary and listens to `Activated`; a later copy
  calls `RedirectActivationToAsync` with its own activation arguments and
  resolves with `isPrimary: false`. `onRedirect` gets `kind`, `commandLine`
  (when the activation has one) and the raw `data`. Call it before the first
  window; it needs `initWindowsAppSdk`. Every Node-hosted app is `node.exe`, so
  pick a key nobody else would.
- `notify` is `AppNotificationBuilder` and `AppNotificationManager.Show`.
  Unpackaged apps must register first: the first call does, with
  `displayName` and `iconPath` (both or neither), and listens for clicks with
  that call's `onInvoked`. `appUserModelId` is the window's `appUserModelId`
  (`joinAppUserModel`): give both the same id.
- **What works from `node.exe` is not known.** Both are written to Microsoft's
  documented unpackaged path and unit-tested on stand-ins; neither was run
  against a real second process or a real toast, and the platform may refuse a
  process with no package identity (no notification, or a click that cannot
  start the app once it has exited). `test/app.test.ts` starts a second copy
  and reports what `notify` did; run it in a desktop session before relying on
  either. With package identity (an MSIX or sparse package) both are the
  supported case.

### Localization: what works unpackaged

- **`Intl` and your own string tables work everywhere.**
  `new Intl.DateTimeFormat().resolvedOptions().locale` is the user's locale
  and needs nothing from Windows; a table keyed by language is the portable
  way to translate an app hosted from `node.exe`.
- **WinUI's `ResourceLoader` (`.resw` / `resources.pri`) is not wired up, and
  by default will not find your strings.** An unpackaged app's default
  resource file is `resources.pri` next to the running `.exe` (Microsoft's
  documentation, for apps without package identity: build it with `makepri`
  without a packaging section and copy it beside the program). Hosted from
  Node, that program is `node.exe`, in Node's folder, not yours. Its bindings
  have a constructor that takes a `.pri` path (`new ResourceLoader(fileName)`),
  which would sidestep this; it is not exercised by any test here, so treat it
  as untried. Without package identity the loader also follows the system
  display language, not the user's preferred-language list.
- **XAML's `x:Uid` does not apply**: components are Svelte, not XAML.
- **Package identity** (an MSIX, or a sparse package) is what unlocks the
  rest of Windows' app model: the per-package resource lookup above, toast
  notifications that survive the app closing, and `AppInstance` redirection
  by package. Nothing in this section needs it.

### Planned, not in the package yet

- A `ResourceLoader` wrapper that finds a `.pri` beside the app.

The working example is `examples/services` (`test/services.test.ts` runs it in
a real window; the dialogs themselves need a person and are not opened there).
