import type { TrayMenuHeaderProps } from "./menu-props.ts";
import type { Component } from "svelte";

declare const TrayMenuHeader: Component<TrayMenuHeaderProps, Record<string, never>, "">;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default TrayMenuHeader;
