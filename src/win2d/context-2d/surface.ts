import { clear } from "#src/win2d/draw.js";
import { createRenderTarget } from "#src/win2d/resources.js";
import type { CanvasBitmap } from "#winui/microsoft/graphics/canvas/CanvasBitmap";
import type { CanvasDevice } from "#winui/microsoft/graphics/canvas/CanvasDevice";
import type { CanvasDrawingSession } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";
import type { CanvasRenderTarget } from "#winui/microsoft/graphics/canvas/CanvasRenderTarget";

const DEFAULT_DPI = 96;
const MINIMUM_SIZE = 1;
const TRANSPARENT = {
  a: 0,
  r: 0,
  g: 0,
  b: 0
};

// Direct2D has no empty surface: a canvas of no size keeps one pixel.
function allocate({ device, width, height }: {
  device: CanvasDevice;
  width: number;
  height: number;
}) {
  const target = createRenderTarget({
    creator: device,
    width: Math.max(MINIMUM_SIZE, width),
    height: Math.max(MINIMUM_SIZE, height),
    dpi: DEFAULT_DPI
  });
  // A new surface holds whatever the memory held before, not transparent black.
  const session = target.createDrawingSession();
  clear({
    session,
    color: TRANSPARENT
  });
  session.close();
  return target;
}

/** One drawing step: what runs on the surface's drawing session. */
export type SurfaceCommand = (session: CanvasDrawingSession) => void;

/**
 * The pixels a canvas keeps: a render target and the drawing session open on
 * it. Reading the pixels (or handing the target to anything else) closes the
 * session first, which is what makes Direct2D finish the drawing.
 */
export class Surface {
  private bitmap: CanvasRenderTarget;
  private session: CanvasDrawingSession | undefined;
  private canvasDevice: CanvasDevice;
  private readonly listeners = new Set<() => void>();

  constructor({ device, width, height }: {
    device: CanvasDevice;
    width: number;
    height: number;
  }) {
    this.canvasDevice = device;
    this.bitmap = allocate({
      device,
      width,
      height
    });
  }

  /** The device the pixels live on. */
  get device() {
    return this.canvasDevice;
  }

  /** Whether a bitmap is this surface's own pixels (Direct2D cannot draw a surface onto itself). */
  owns(bitmap: CanvasBitmap) {
    return bitmap === this.bitmap;
  }

  /** The finished pixels as a render target (an image Win2D can draw). */
  get target() {
    this.flush();
    return this.bitmap;
  }

  /** Runs a command on the open session, opening one if there is none. */
  draw(command: SurfaceCommand) {
    this.session ??= this.bitmap.createDrawingSession();
    command(this.session);
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Closes the open session, so the drawing is in the pixels. */
  flush() {
    this.session?.close();
    this.session = undefined;
  }

  /** Replaces the pixels with blank ones of a new size, on the same or another device. */
  reset({ width, height, device = this.canvasDevice }: {
    width: number;
    height: number;
    device?: CanvasDevice;
  }) {
    this.flush();
    this.bitmap.close();
    this.canvasDevice = device;
    this.bitmap = allocate({
      device,
      width,
      height
    });
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Calls a function after each change; returns the function that stops it. */
  watch(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
