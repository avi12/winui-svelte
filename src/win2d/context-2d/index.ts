// The opt-in HTML Canvas 2D API over Win2D: `winui-svelte/win2d/context-2d`.
// An app that imports only `winui-svelte/win2d` bundles none of it.

export { default as Canvas2D } from "./Canvas2D.svelte";
export type { Canvas2DProps } from "./canvas-2d-props.ts";
export type { BoundingRectangle, CanvasElementOptions, CanvasEvent, CanvasListener, ListenerOptions } from "./canvas-element.ts";
export { CanvasElement, createCanvas2D } from "./canvas-element.ts";
export { Context2D } from "./context.ts";
export type { ImageSource, TextMetrics, TransformMatrix } from "./context.ts";
export { ImageData } from "./image-data.ts";
export { CanvasGradient, CanvasPattern } from "./paint.ts";
export type { CornerRadius, MatrixInit } from "./path.ts";
export { Path2D } from "./path.ts";
