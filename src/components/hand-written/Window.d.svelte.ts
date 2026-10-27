import type { WindowComponentProps } from "./window-props.ts";
import type { Component } from "svelte";

export type { WindowComponentProps };

declare const Window: Component<WindowComponentProps, Record<string, never>, "handle">;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default Window;
