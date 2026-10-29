// The components: every WinUI control and value object, generated from its
// metadata, and the window.

export * from "./generated/index.ts";
export { default as Window } from "./hand-written/Window.svelte";
export type { WindowComponentProps } from "./hand-written/Window.d.svelte.ts";
export type { ListHandle } from "./hand-written/items/items-host.svelte.ts";
export { default as Navigator } from "./hand-written/navigation/Navigator.svelte";
export type { NavigatorComponentProps } from "./hand-written/navigation/Navigator.d.svelte.ts";
export type {
  NavigatedEvent,
  NavigateOptions,
  NavigationEntry,
  NavigationPage,
  NavigatorHandle,
  PageComponent,
  PageTarget
} from "./hand-written/navigation/navigator-host.svelte.ts";
export { NavigationCacheMode, NavigationMode } from "./hand-written/navigation/navigation-stack.ts";
export { MoveDirection } from "./hand-written/items/reorder.ts";
export { ticksDate, ticksMilliseconds } from "./values.ts";
export type { ResourceRecordInput, ResourceValueInput } from "./resource-record.ts";
export { goToState, installXaml, resourceDictionaryOf, xamlOf } from "./xaml.ts";
export type { XamlSource } from "./xaml-source.ts";
export { XamlKind } from "./xaml-source.ts";
export type { CaptionButtonColors, TitleBarHeight, WindowPresentation, WindowRegion, WindowTheme } from "#src/window/chrome.js";
export type { WindowHandle } from "#src/window/window-handle.js";
export type { WindowBounds, WindowPlacement } from "#src/window/window-host.svelte.js";
