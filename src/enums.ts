// Every closed set of values a prop or an option takes, each one name for the
// value (`Backdrop.mica`) and its type (`Backdrop`): WinUI's enums from their
// own bindings modules, WinUI's theme brushes, and the package's own sets. Re-
// exports only, so an app bundles just the sets it imports and `import type`
// costs nothing.

export * from "./components/generated/enums.ts";
export { MoveDirection } from "./components/hand-written/items/reorder.ts";
export { NavigationCacheMode, NavigationMode } from "./components/hand-written/navigation/navigation-stack.ts";
export { RestartCondition } from "./app/restart-after-crash.ts";
export { ColorKeyword } from "./components/values.ts";
export { XamlKind } from "./components/xaml-source.ts";
export { FocusKind } from "./renderer/host/focus-element.ts";
export { TrayGesture } from "./tray/click-detector.ts";
export { TrayBalloonIcon } from "./tray/tray-core.ts";
export { SizeToContent, WindowAnchor } from "./window/anchor.ts";
export { Backdrop } from "./window/backdrop.ts";
export { TitleBarHeight, WindowPresentation, WindowTheme } from "./window/chrome.ts";
export { DockDisplay } from "./window/dock.ts";
export { PickerLocation } from "./window/pickers.ts";
