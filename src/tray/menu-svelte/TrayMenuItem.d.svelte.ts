import type { TrayMenuItemProps } from "./menu-props.ts";
import type { Component } from "svelte";

declare const TrayMenuItem: Component<TrayMenuItemProps, Record<string, never>, "">;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default TrayMenuItem;
