import type { Canvas2DProps } from "./canvas-2d-props.ts";
import type { Component } from "svelte";

export type { Canvas2DProps };

declare const Canvas2D: Component<Canvas2DProps, Record<string, never>, "canvas">;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default Canvas2D;
