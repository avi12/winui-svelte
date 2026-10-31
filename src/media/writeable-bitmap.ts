import { writeBuffer } from "./pixel-buffer.ts";
import { ImageSource, projectAs } from "#src/components/generated/bindings.js";
import { WriteableBitmap } from "#winui/microsoft/ui/xaml/media/imaging/WriteableBitmap";

const CHANNELS = 4;
const OPAQUE = 255;
const ALPHA_OFFSET = 3;

/** The pixels of a bitmap: straight (not premultiplied) RGBA, 8 bits a channel, rows from the top, no padding. */
export interface BitmapPixels {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array | Uint8ClampedArray;
}

// WinUI's pixel buffer is BGRA with the color already multiplied by the alpha.
function bgraPremultiplied({ width, height, pixels }: BitmapPixels) {
  const expected = width * height * CHANNELS;
  const isWrongLength = pixels.length !== expected;
  if (isWrongLength) {
    throw new RangeError(`${width} by ${height} pixels are ${expected} bytes, not ${pixels.length}`);
  }

  const converted = new Uint8Array(expected);
  for (let start = 0; start < expected; start += CHANNELS) {
    const alpha = pixels[start + ALPHA_OFFSET] ?? OPAQUE;
    converted[start] = Math.round((pixels[start + 2] ?? 0) * alpha / OPAQUE);
    converted[start + 1] = Math.round((pixels[start + 1] ?? 0) * alpha / OPAQUE);
    converted[start + 2] = Math.round((pixels[start] ?? 0) * alpha / OPAQUE);
    converted[start + ALPHA_OFFSET] = alpha;
  }

  return converted;
}

/**
 * An image source holding raw pixels, for an `Image`, `ImageBrush` or
 * `ImageIcon` `source`: a chart, a canvas readback or a decoded frame that
 * has no file to load. Make it on the UI thread.
 *
 * @param options - The size and the RGBA pixels.
 * @returns The source; give it to `setBitmapPixels` to draw another frame in it.
 */
export function writeableBitmapOf(options: BitmapPixels) {
  const bitmap = new WriteableBitmap(options.width, options.height);
  const source = projectAs(bitmap, ImageSource);
  setBitmapPixels({
    source,
    ...options
  });
  return source;
}

/**
 * Replaces the pixels of a source `writeableBitmapOf` made, and tells WinUI to
 * draw them.
 *
 * @param options - The source, and pixels of the size it was made with.
 * @throws {RangeError} when the size is not the source's
 */
export function setBitmapPixels({ source, ...frame }: BitmapPixels & {
  source: ImageSource;
}) {
  const bitmap = projectAs(source, WriteableBitmap);
  const isSameSize = bitmap.pixelWidth === frame.width && bitmap.pixelHeight === frame.height;
  if (!isSameSize) {
    throw new RangeError(`the bitmap is ${bitmap.pixelWidth} by ${bitmap.pixelHeight}, not ${frame.width} by ${frame.height}`);
  }

  writeBuffer({
    buffer: bitmap.pixelBuffer,
    bytes: bgraPremultiplied(frame)
  });
  bitmap.invalidate();
}
