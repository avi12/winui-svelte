import type { TrayMenuOperationsProps } from "./menu-props.ts";
import type { Component } from "svelte";

declare const TrayMenuOperations: Component<TrayMenuOperationsProps, Record<string, never>, "">;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default TrayMenuOperations;
