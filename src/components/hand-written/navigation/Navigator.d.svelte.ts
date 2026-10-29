import type { NavigatorComponentProps } from "./navigator-props.ts";
import type { Component } from "svelte";

export type { NavigatorComponentProps };

declare const Navigator: Component<NavigatorComponentProps, Record<string, never>, "handle">;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default Navigator;
