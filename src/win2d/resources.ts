import { streamOf } from "#src/components/byte-stream.js";
import { CanvasBitmap } from "#winui/microsoft/graphics/canvas/CanvasBitmap";
import { CanvasDevice } from "#winui/microsoft/graphics/canvas/CanvasDevice";
import type { Color, Vector2 } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";
import { CanvasRenderTarget } from "#winui/microsoft/graphics/canvas/CanvasRenderTarget";
import { CanvasFigureLoop } from "#winui/microsoft/graphics/canvas/geometry/CanvasFigureLoop";
import { CanvasGeometry } from "#winui/microsoft/graphics/canvas/geometry/CanvasGeometry";
import { CanvasPathBuilder } from "#winui/microsoft/graphics/canvas/geometry/CanvasPathBuilder";
import type { ICanvasResourceCreator } from "#winui/microsoft/graphics/canvas/ICanvasResourceCreator";
import { CanvasTextFormat } from "#winui/microsoft/graphics/canvas/text/CanvasTextFormat";
import { Uri } from "#winui/windows/foundation/Uri";

// Making what a draw handler draws with: devices, off-screen surfaces,
// bitmaps, text formats and geometries.

const DEFAULT_DPI = 96;
const DEFAULT_FONT_SIZE = 14;
const BYTES_PER_PIXEL = 4;
const URI_SCHEME = /^[a-z][a-z\d+.-]*:\/\//iu;

/**
 * The device every canvas of the process shares, the one a CanvasControl
 * draws with unless it is given its own. Call it after the Windows App SDK
 * started (initWindowsAppSdk).
 *
 * @throws {Error} when Win2D cannot make a device (no Direct3D 11 adapter)
 */
export function sharedDevice() {
  const device = CanvasDevice.getSharedDevice();
  const isMissing = device === null;
  if (isMissing) {
    throw new Error("Win2D could not make a device");
  }

  return device;
}

/** A surface to draw on off screen, in device-independent pixels at a dpi. */
export function createRenderTarget({ creator, width, height, dpi = DEFAULT_DPI }: {
  creator: ICanvasResourceCreator;
  width: number;
  height: number;
  dpi?: number;
}) {
  return new CanvasRenderTarget(creator, width, height, dpi);
}

/** The pixels of a render target or a bitmap: BGRA, one byte per channel, row by row. */
export function readPixels(surface: CanvasBitmap) {
  const { width, height } = surface.sizeInPixels;
  return {
    width,
    height,
    bytes: new Uint8Array(surface.getPixelBytes()),
    bytesPerPixel: BYTES_PER_PIXEL
  };
}

/** The color of one pixel of what readPixels returned. */
export function pixelAt({ pixels, x, y }: {
  pixels: ReturnType<typeof readPixels>;
  x: number;
  y: number;
}) {
  const start = (y * pixels.width + x) * pixels.bytesPerPixel;
  const [blue = 0, green = 0, red = 0, alpha = 0] = pixels.bytes.subarray(start, start + pixels.bytesPerPixel);
  return {
    a: alpha,
    r: red,
    g: green,
    b: blue
  } satisfies Color;
}

/**
 * Decodes an image into a bitmap on the device: from the bytes of an encoded
 * file (PNG, JPEG, ...), a URI (`https://`, `ms-appx://`...) or a file path.
 */
export async function loadBitmap({ creator, source }: {
  creator: ICanvasResourceCreator;
  source: Uint8Array | string;
}) {
  const isBytes = source instanceof Uint8Array;
  if (isBytes) {
    return CanvasBitmap.loadAsync(creator, await streamOf(source));
  }

  const isUri = URI_SCHEME.test(source);
  return isUri ? CanvasBitmap.loadAsync(creator, new Uri(source)) : CanvasBitmap.loadAsync(creator, source);
}

/** A bitmap from an array of colors, row by row. */
export function bitmapFromColors({ creator, colors, width, height }: {
  creator: ICanvasResourceCreator;
  colors: Color[];
  width: number;
  height: number;
}) {
  return CanvasBitmap.createFromColors(creator, colors, width, height);
}

/** A text format, for drawText. */
export function createTextFormat({ family = "Segoe UI", size = DEFAULT_FONT_SIZE }: {
  family?: string;
  size?: number;
} = {}) {
  const format = new CanvasTextFormat();
  format.fontFamily = family;
  format.fontSize = size;
  return format;
}

/** One connected run of a path. */
export interface Figure {
  start: Vector2;

  /** Straight lines to these points, in order. */
  lines: Vector2[];

  /** Whether the last point joins back to the start. */
  isClosed?: boolean;
}

/** A geometry from figures of straight lines, to fill or stroke. */
export function polylineGeometry({ creator, figures }: {
  creator: ICanvasResourceCreator;
  figures: Figure[];
}) {
  const builder = new CanvasPathBuilder(creator);
  for (const figure of figures) {
    builder.beginFigureAtCoords(figure.start.x, figure.start.y);
    for (const point of figure.lines) {
      builder.addLineWithCoords(point.x, point.y);
    }

    builder.endFigure(figure.isClosed === true ? CanvasFigureLoop.Closed : CanvasFigureLoop.Open);
  }

  return CanvasGeometry.createPath(builder);
}

/** A rounded rectangle, to fill or stroke. */
export function roundedRectangleGeometry({ creator, x, y, width, height, radius }: {
  creator: ICanvasResourceCreator;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}) {
  return CanvasGeometry.createRoundedRectangle(creator, x, y, width, height, radius, radius);
}

/** A circle, to fill or stroke. */
export function circleGeometry({ creator, x, y, radius }: {
  creator: ICanvasResourceCreator;
  x: number;
  y: number;
  radius: number;
}) {
  return CanvasGeometry.createCircle(creator, x, y, radius);
}
