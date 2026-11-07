import type { TrayMenuSubmenuProps } from "./menu-props.ts";
import type { Component } from "svelte";

declare const TrayMenuSubmenu: Component<TrayMenuSubmenuProps, Record<string, never>, "">;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default TrayMenuSubmenu;
