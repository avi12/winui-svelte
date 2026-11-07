import type { ResizeQuality } from "./image-types.ts";
import { ResizeQuality as Quality } from "./image-types.ts";
import { ImageData } from "#src/win2d/context-2d/image-data.js";
import type { Rectangle } from "#src/win2d/context-2d/image-plan.js";

// Pixel arithmetic on ImageData (RGBA, straight alpha): what the codecs need
// between a decoded frame and a Win2D bitmap or an encoder.

const CHANNELS = 4;
const MAX_CHANNEL = 255;
const RED = 0;
const GREEN = 1;
const BLUE = 2;
const ALPHA = 3;
const HALF = 0.5;

/** The bytes with red and blue swapped: RGBA to BGRA and back. */
export function swapRedBlue(bytes: Uint8ClampedArray | Uint8Array) {
  const swapped = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += CHANNELS) {
    swapped[i + RED] = bytes[i + BLUE] ?? 0;
    swapped[i + GREEN] = bytes[i + GREEN] ?? 0;
    swapped[i + BLUE] = bytes[i + RED] ?? 0;
    swapped[i + ALPHA] = bytes[i + ALPHA] ?? 0;
  }

  return swapped;
}

function multiplyByAlpha({ data, alphaAt }: {
  data: Uint8ClampedArray | Uint8Array;
  alphaAt: number;
}) {
  for (let i = 0; i < data.length; i += CHANNELS) {
    const scale = (data[i + alphaAt] ?? 0) / MAX_CHANNEL;
    data[i + RED] = Math.round((data[i + RED] ?? 0) * scale);
    data[i + GREEN] = Math.round((data[i + GREEN] ?? 0) * scale);
    data[i + BLUE] = Math.round((data[i + BLUE] ?? 0) * scale);
  }
}

/** Straight-alpha RGBA as the premultiplied BGRA of a Win2D bitmap. */
export function premultipliedBgra(image: ImageData) {
  const bytes = swapRedBlue(image.data);
  multiplyByAlpha({
    data: bytes,
    alphaAt: ALPHA
  });
  return bytes;
}

/** The image drawn over opaque black, which is how a format with no alpha channel keeps transparency. */
export function flattenedOverBlack(image: ImageData) {
  const data = new Uint8ClampedArray(image.data);
  multiplyByAlpha({
    data,
    alphaAt: ALPHA
  });
  for (let i = ALPHA; i < data.length; i += CHANNELS) {
    data[i] = MAX_CHANNEL;
  }

  return new ImageData(data, image.width, image.height);
}

/** The image upside down. */
export function flippedVertically(image: ImageData) {
  const rowLength = image.width * CHANNELS;
  const data = new Uint8ClampedArray(image.data.length);
  for (let row = 0; row < image.height; row++) {
    const from = row * rowLength;
    const to = (image.height - 1 - row) * rowLength;
    data.set(image.data.subarray(from, from + rowLength), to);
  }

  return new ImageData(data, image.width, image.height);
}

/**
 * A rectangle of the image; a negative width or height reaches left or up, as
 * `createImageBitmap` has it, and what is outside the image is transparent.
 */
export function croppedImage({ image, rectangle }: {
  image: ImageData;
  rectangle: Rectangle;
}) {
  const width = Math.abs(rectangle.width);
  const height = Math.abs(rectangle.height);
  const left = rectangle.width < 0 ? rectangle.x + rectangle.width : rectangle.x;
  const top = rectangle.height < 0 ? rectangle.y + rectangle.height : rectangle.y;
  const first = Math.max(0, -left);
  const last = Math.min(width, image.width - left);
  const cropped = new ImageData(width, height);
  for (let row = 0; row < height; row++) {
    const sourceRow = top + row;
    const isRowInside = sourceRow >= 0 && sourceRow < image.height;
    const isEmpty = !isRowInside || last <= first;
    if (isEmpty) {
      continue;
    }

    const from = (sourceRow * image.width + left + first) * CHANNELS;
    cropped.data.set(image.data.subarray(from, from + (last - first) * CHANNELS), (row * width + first) * CHANNELS);
  }

  return cropped;
}

function sampled({ image, x, y, channel }: {
  image: ImageData;
  x: number;
  y: number;
  channel: number;
}) {
  const column = Math.min(image.width - 1, Math.max(0, x));
  const row = Math.min(image.height - 1, Math.max(0, y));
  return image.data[(row * image.width + column) * CHANNELS + channel] ?? 0;
}

function interpolated({ image, x, y, channel }: {
  image: ImageData;
  x: number;
  y: number;
  channel: number;
}) {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const fractionX = x - left;
  const fractionY = y - top;
  const corner = {
    image,
    channel
  };
  const topLeft = sampled({
    ...corner,
    x: left,
    y: top
  });
  const topRight = sampled({
    ...corner,
    x: left + 1,
    y: top
  });
  const bottomLeft = sampled({
    ...corner,
    x: left,
    y: top + 1
  });
  const bottomRight = sampled({
    ...corner,
    x: left + 1,
    y: top + 1
  });
  const upper = topLeft * (1 - fractionX) + topRight * fractionX;
  const lower = bottomLeft * (1 - fractionX) + bottomRight * fractionX;
  return upper * (1 - fractionY) + lower * fractionY;
}

/** The image scaled to a size: the nearest pixel for `pixelated`, a bilinear blend for the rest. */
export function resizedImage({ image, width, height, quality }: {
  image: ImageData;
  width: number;
  height: number;
  quality: ResizeQuality;
}) {
  const resized = new ImageData(width, height);
  const isPixelated = quality === Quality.PIXELATED;
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const x = (column + HALF) * image.width / width - HALF;
      const y = (row + HALF) * image.height / height - HALF;
      for (let channel = 0; channel < CHANNELS; channel++) {
        resized.data[(row * width + column) * CHANNELS + channel] = isPixelated
          ? sampled({
            image,
            x: Math.round(x),
            y: Math.round(y),
            channel
          })
          : interpolated({
            image,
            x,
            y,
            channel
          });
      }
    }
  }

  return resized;
}
