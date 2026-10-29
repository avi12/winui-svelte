import type { CanvasProps } from "./canvas-props.ts";
import type { Component } from "svelte";

export type { CanvasProps };

declare const Canvas: Component<CanvasProps, Record<string, never>, "">;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default Canvas;
