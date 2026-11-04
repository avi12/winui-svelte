// The components: every WinUI control and value object, generated from its
// metadata, and the window.

export * from "./generated/index.ts";
export { default as Window } from "./hand-written/Window.svelte";
export type { WindowComponentProps } from "./hand-written/Window.d.svelte.ts";
export type { Group } from "./hand-written/items/grouping.ts";
export type { ListHandle } from "./hand-written/items/items-host.svelte.ts";
export { default as VisualStateGroups } from "./hand-written/visual-states/VisualStateGroups.svelte";
export type { VisualStateGroupsProps } from "./hand-written/visual-states/VisualStateGroups.d.svelte.ts";
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
export { FluentGlyph } from "./fluent-glyph.ts";
export type { FluentGlyphCode, FluentGlyphName, FluentGlyphValue } from "./fluent-glyph.ts";
export type { FontFamilyName } from "./font-family-name.ts";
export { isColorText, ticksDate, ticksMilliseconds } from "./values.ts";
export type { ColorInput, ColorKeyword, ColorText, GridLengthText, HexColor } from "./values.ts";
export type {
  AppBrushes,
  BrushInput,
  EnumInput,
  FlagsInput,
  FontFamilyInput,
  GeometryInput,
  GlyphInput,
  GridLengthInput
} from "./convert.ts";
export type { ResourceRecordInput, ResourceValueInput } from "./resource-record.ts";
export { installMedia } from "./media.ts";
export { goToState, installXaml, resourceDictionaryOf, xamlOf } from "./xaml.ts";
export type { XamlSource } from "./xaml-source.ts";
export { XamlKind } from "./xaml-source.ts";
export type { CaptionButtonColors, TitleBarHeight, WindowPresentation, WindowRegion, WindowTheme } from "#src/window/chrome.js";
export type { WindowHandle } from "#src/window/window-handle.js";
export type { WindowBounds, WindowPlacement } from "#src/window/window-host.svelte.js";
