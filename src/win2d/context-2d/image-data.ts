import type { Surface } from "./surface.ts";

const CHANNELS = 4;
const MAX_CHANNEL = 255;
// Where each channel is in a pixel: Win2D keeps BGRA, an ImageData RGBA.
const NATIVE_BLUE = 0;
const NATIVE_GREEN = 1;
const NATIVE_RED = 2;
const IMAGE_RED = 0;
const IMAGE_GREEN = 1;
const IMAGE_BLUE = 2;
const ALPHA = 3;

/**
 * Pixels as the platform's ImageData: `data` is RGBA, one byte per channel,
 * row by row, with the color not multiplied by the alpha.
 */
export class ImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  readonly colorSpace = "srgb";

  /**
   * A blank image of a size, or the given bytes read as an image of that width.
   *
   * @throws {RangeError} when a size is not a positive integer, or the bytes do not fill whole rows
   */
  constructor(sizeOrData: number | Uint8ClampedArray, widthOrHeight: number, height?: number) {
    const isSize = typeof sizeOrData === "number";
    if (isSize) {
      this.width = sizeOrData;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(sizeOrData * widthOrHeight * CHANNELS);
    } else {
      const rows = sizeOrData.length / CHANNELS / widthOrHeight;
      this.width = widthOrHeight;
      this.height = height ?? rows;
      this.data = sizeOrData;
    }

    const isValid = Number.isInteger(this.width) && Number.isInteger(this.height) && this.width > 0 && this.height > 0;
    const isFilled = this.data.length === this.width * this.height * CHANNELS;
    const isConsistent = isValid && isFilled;
    if (!isConsistent) {
      throw new RangeError("The image size does not match its data");
    }
  }
}

/**
 * The pixels of a rectangle of the surface, un-premultiplied and as RGBA;
 * outside the surface they are transparent black.
 */
export function readImageData({ surface, x, y, width, height }: {
  surface: Surface;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const image = new ImageData(width, height);
  const { width: surfaceWidth, height: surfaceHeight } = surface.target.sizeInPixels;
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(surfaceWidth, x + width);
  const bottom = Math.min(surfaceHeight, y + height);
  const isOutside = right <= left || bottom <= top;
  if (isOutside) {
    return image;
  }

  const copiedWidth = right - left;
  const bytes = surface.target.getPixelBytesWithSubrectangle(left, top, copiedWidth, bottom - top);
  for (let row = 0; row < bottom - top; row++) {
    for (let column = 0; column < copiedWidth; column++) {
      const from = (row * copiedWidth + column) * CHANNELS;
      const to = ((top - y + row) * width + (left - x + column)) * CHANNELS;
      const alpha = bytes[from + ALPHA] ?? 0;
      const scale = alpha === 0 ? 0 : MAX_CHANNEL / alpha;
      image.data[to + IMAGE_RED] = Math.round((bytes[from + NATIVE_RED] ?? 0) * scale);
      image.data[to + IMAGE_GREEN] = Math.round((bytes[from + NATIVE_GREEN] ?? 0) * scale);
      image.data[to + IMAGE_BLUE] = Math.round((bytes[from + NATIVE_BLUE] ?? 0) * scale);
      image.data[to + ALPHA] = alpha;
    }
  }

  return image;
}

/** Replaces a rectangle of the surface with pixels, with no blending, transform or clip. */
export function writeImageData({ surface, image, x, y, dirty }: {
  surface: Surface;
  image: ImageData;
  x: number;
  y: number;
  dirty: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}) {
  const { width: surfaceWidth, height: surfaceHeight } = surface.target.sizeInPixels;
  const left = Math.max(0, x + dirty.x);
  const top = Math.max(0, y + dirty.y);
  const right = Math.min(surfaceWidth, x + dirty.x + dirty.width);
  const bottom = Math.min(surfaceHeight, y + dirty.y + dirty.height);
  const isOutside = right <= left || bottom <= top;
  if (isOutside) {
    return;
  }

  const copiedWidth = right - left;
  const bytes = new Uint8Array(copiedWidth * (bottom - top) * CHANNELS);
  for (let row = 0; row < bottom - top; row++) {
    for (let column = 0; column < copiedWidth; column++) {
      const to = (row * copiedWidth + column) * CHANNELS;
      const from = ((top - y + row) * image.width + (left - x + column)) * CHANNELS;
      const alpha = image.data[from + ALPHA] ?? 0;
      const scale = alpha / MAX_CHANNEL;
      bytes[to + NATIVE_RED] = Math.round((image.data[from + IMAGE_RED] ?? 0) * scale);
      bytes[to + NATIVE_GREEN] = Math.round((image.data[from + IMAGE_GREEN] ?? 0) * scale);
      bytes[to + NATIVE_BLUE] = Math.round((image.data[from + IMAGE_BLUE] ?? 0) * scale);
      bytes[to + ALPHA] = alpha;
    }
  }

  surface.target.setPixelBytesWithSubrectangle(bytes, left, top, copiedWidth, bottom - top);
}
