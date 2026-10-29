import type { Painter } from "./painter.ts";
import type { CanvasControlComponentProps } from "#src/components/generated/win2d/index.js";
import type { CanvasDevice } from "#winui/microsoft/graphics/canvas/CanvasDevice";

/** What a Canvas draw function is given. */
export interface CanvasFrame {
  /** Draws on the canvas; every call is kept and replayed on each redraw. */
  painter: Painter;

  /** The canvas's size in device-independent pixels. */
  width: number;
  height: number;

  /** Pixels per inch of the screen the canvas is on (96 at 100% scale). */
  dpi: number;

  /** Makes the resources the drawing uses (brushes, geometries, bitmaps). */
  device: CanvasDevice;
}

/** The props of Canvas: a CanvasControl's, minus its raw events, plus the draw function. */
export interface CanvasProps extends Omit<CanvasControlComponentProps, "onDraw" | "onCreateResources" | "children"> {
  /**
   * Draws the canvas. It runs again, and the canvas redraws, whenever state it
   * read changes or the canvas is resized.
   */
  draw: (frame: CanvasFrame) => void;

  /** Runs after each redraw the control painted, with the number of redraws so far. */
  onDrawn?: (count: number) => void;

  /** Makes the resources `draw` needs, once the device exists and again when it is lost. */
  createResources?: (options: { device: CanvasDevice }) => void | Promise<void>;
}
