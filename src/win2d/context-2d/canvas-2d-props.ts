import type { CanvasElement } from "./canvas-element.ts";
import type { CanvasControlComponentProps } from "#src/components/generated/win2d/index.js";

/** The props of Canvas2D: a CanvasControl's, minus its raw draw events, plus the canvas the control shows. */
export interface Canvas2DProps extends Omit<CanvasControlComponentProps, "ondraw" | "oncreateresources" | "children"> {
  /**
   * The canvas the control shows (bindable). Without one, the component makes
   * one, so `bind:canvas` hands you the canvas to draw on.
   */
  canvas?: CanvasElement;

  /**
   * Draws on the canvas. It runs once the control has a size, and again, on a
   * cleared canvas, whenever state it read changes or the control is resized.
   */
  draw?: (canvas: CanvasElement) => void;

  /** Whether the canvas takes the size of the control (the default); a resize clears it and runs `draw`. */
  shouldFit?: boolean;

  /** Runs after each time the control painted the canvas, with the number of paints so far. */
  ondrawn?: (count: number) => void;
}
