import { CaptureFormat } from "./format.ts";
import type { CaptureFrame } from "./frame.ts";
import { sizeWithin } from "./region.ts";
import { shrinkPixels } from "./resample.ts";
import { parseMaxEdge, parseQuality } from "./schema.ts";
import { windowsImageCodec } from "#src/web-apis/image-codec-windows.js";
import { swapRedBlue } from "#src/web-apis/image-pixels.js";
import { ImageMimeType } from "#src/web-apis/image-types.js";
import { ImageData } from "#src/win2d/context-2d/image-data.js";

const DEFAULT_QUALITY = 0.7;
const CHANNELS = 4;

/** What `encodeJpeg` is given. */
export interface EncodeJpegOptions {
  /** The picture: a `captureMonitor` frame, or any pixels with a width and a height. */
  readonly frame: Pick<CaptureFrame, "height" | "pixels" | "width"> & Partial<Pick<CaptureFrame, "format" | "region" | "scale">>;

  /** From 0 to 1; 0.7 by default, enough to read a screen at the size a model takes. */
  readonly quality?: number | undefined;

  /**
   * Shrinks the picture, bilinear, until its longest edge is this long. It
   * never enlarges. Leave it out when `captureMonitor` already shrank it on
   * the GPU.
   */
  readonly maxEdge?: number | undefined;
}

/** A JPEG of a frame. */
export interface EncodedJpeg {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;

  /**
   * JPEG pixels per monitor pixel across, when the frame says what part of
   * the monitor it shows: a point at `x` in the JPEG is at `region.x + x / scale`
   * on the monitor. 1 for pixels that came from nowhere in particular.
   */
  readonly scale: number;
}

/**
 * A frame as a JPEG, shrunk first when it is longer than `maxEdge`. The
 * encoder is the one the web `canvas.toBlob` uses here (Windows' own), so the
 * bytes are not the same as another JPEG encoder's at the same quality.
 *
 * @param options - The frame, the quality and the longest edge.
 * @returns The bytes, the size they hold and the scale from the monitor.
 * @throws {z.ZodError} when the quality or the longest edge is not valid
 */
export async function encodeJpeg({ frame, quality = DEFAULT_QUALITY, maxEdge }: EncodeJpegOptions) {
  const checkedQuality = parseQuality(quality);
  const size = {
    width: frame.width,
    height: frame.height
  };
  const target = sizeWithin({
    size,
    maxEdge: maxEdge === undefined ? undefined : parseMaxEdge(maxEdge)
  });
  const isShrunk = target.width !== size.width || target.height !== size.height;
  const shrunk = isShrunk
    ? shrinkPixels({
      pixels: frame.pixels,
      size,
      target
    })
    : frame.pixels;
  const isBlueFirst = frame.format === CaptureFormat.BGRA;
  const rgba = isBlueFirst ? swapRedBlue(shrunk) : shrunk;
  const clamped = new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, target.width * target.height * CHANNELS);
  const image = new ImageData(clamped, target.width);
  const bytes = await windowsImageCodec().encode({
    image,
    type: ImageMimeType.JPEG,
    quality: checkedQuality
  });
  return {
    bytes,
    width: target.width,
    height: target.height,
    scale: target.width / size.width * (frame.scale ?? 1)
  } satisfies EncodedJpeg;
}
