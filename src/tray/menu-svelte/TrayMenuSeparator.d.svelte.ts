import type { TrayMenuSeparatorProps } from "./menu-props.ts";
import type { Component } from "svelte";

declare const TrayMenuSeparator: Component<TrayMenuSeparatorProps, Record<string, never>, "">;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default TrayMenuSeparator;
