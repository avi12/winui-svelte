import type { CanvasProps } from "./canvas-props.ts";
import type { Component } from "svelte";

export type { CanvasProps };

declare const Canvas: Component<CanvasProps, Record<string, never>, "">;
export default Canvas;
