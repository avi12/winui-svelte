// The arithmetic between the image the caller has and the bitmap the engine
// reads: the crop of a region, the downscale to the engine's largest edge, and
// the way back for every box the engine returns. Pure, so it runs without
// Windows.

/** Bytes in one BGRA pixel. */
export const BYTES_PER_PIXEL = 4;

/** A rectangle in pixels. */
export interface OcrBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * The part of an image to read, in whole pixels and inside the image: the
 * region widened to the pixels it touches, clipped to the image, or the whole
 * image when no region is given.
 *
 * @returns The crop, or `undefined` when the region misses the image.
 */
export function cropOf({ region, width, height }: Size & {
  readonly region: OcrBox | undefined;
}) {
  const left = Math.max(0, Math.floor(region?.x ?? 0));
  const top = Math.max(0, Math.floor(region?.y ?? 0));
  const right = Math.min(width, Math.ceil(region === undefined ? width : region.x + region.width));
  const bottom = Math.min(height, Math.ceil(region === undefined ? height : region.y + region.height));
  const isEmpty = right <= left || bottom <= top;
  if (isEmpty) {
    return undefined;
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  } satisfies OcrBox;
}

/**
 * The size an image is read at: itself when its longer edge fits the limit,
 * else scaled down, keeping the proportions, until it does.
 */
export function fittedSize({ width, height, limit }: Size & {
  readonly limit: number;
}) {
  const longerEdge = Math.max(width, height);
  const isWithinLimit = longerEdge <= limit;
  if (isWithinLimit) {
    return {
      width,
      height
    } satisfies Size;
  }

  const scale = limit / longerEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  } satisfies Size;
}

/** The pixels of one rectangle of a BGRA image: a copy, or a view when the rectangle is whole rows. */
export function croppedPixels({ pixels, width, crop }: {
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly crop: OcrBox;
}) {
  const rowBytes = crop.width * BYTES_PER_PIXEL;
  const isWholeRows = crop.x === 0 && crop.width === width;
  if (isWholeRows) {
    return pixels.subarray(crop.y * rowBytes, (crop.y + crop.height) * rowBytes);
  }

  const cropped = new Uint8Array(rowBytes * crop.height);
  for (let row = 0; row < crop.height; row++) {
    const start = ((crop.y + row) * width + crop.x) * BYTES_PER_PIXEL;
    cropped.set(pixels.subarray(start, start + rowBytes), row * rowBytes);
  }

  return cropped;
}

function averageOf({ pixels, width, from, to }: {
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly from: Point;
  readonly to: Point;
}) {
  const sums = Array.from({ length: BYTES_PER_PIXEL }, () => 0);
  for (let y = from.y; y < to.y; y++) {
    for (let x = from.x; x < to.x; x++) {
      const start = (y * width + x) * BYTES_PER_PIXEL;
      for (let channel = 0; channel < BYTES_PER_PIXEL; channel++) {
        sums[channel] = (sums[channel] ?? 0) + (pixels[start + channel] ?? 0);
      }
    }
  }

  const count = (to.x - from.x) * (to.y - from.y);
  return sums.map(sum => Math.round(sum / count));
}

/** A BGRA image shrunk to a smaller size, each new pixel the average of the pixels it covers. */
export function downscaledPixels({ pixels, source, target }: {
  readonly pixels: Uint8Array;
  readonly source: Size;
  readonly target: Size;
}) {
  const scaled = new Uint8Array(target.width * target.height * BYTES_PER_PIXEL);
  const stepX = source.width / target.width;
  const stepY = source.height / target.height;
  for (let row = 0; row < target.height; row++) {
    const top = Math.floor(row * stepY);
    const bottom = Math.max(top + 1, Math.min(source.height, Math.ceil((row + 1) * stepY)));
    for (let column = 0; column < target.width; column++) {
      const left = Math.floor(column * stepX);
      const right = Math.max(left + 1, Math.min(source.width, Math.ceil((column + 1) * stepX)));
      scaled.set(
        averageOf({
          pixels,
          width: source.width,
          from: {
            x: left,
            y: top
          },
          to: {
            x: right,
            y: bottom
          }
        }), (row * target.width + column) * BYTES_PER_PIXEL
      );
    }
  }

  return scaled;
}

/**
 * A box the engine returned, in the bitmap it read, moved back into the
 * source image's pixels: the downscale undone, then the crop's offset added.
 *
 * @returns The box with whole-pixel edges.
 */
export function sourceBox({ box, crop, read }: {
  readonly box: OcrBox;
  readonly crop: OcrBox;
  readonly read: Size;
}) {
  const scaleX = read.width / crop.width;
  const scaleY = read.height / crop.height;
  const left = Math.round(crop.x + box.x / scaleX);
  const top = Math.round(crop.y + box.y / scaleY);
  const right = Math.round(crop.x + (box.x + box.width) / scaleX);
  const bottom = Math.round(crop.y + (box.y + box.height) / scaleY);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  } satisfies OcrBox;
}

/** The smallest box that holds every box given (an empty box for none). */
export function unionOf(boxes: readonly OcrBox[]) {
  const [first, ...rest] = boxes;
  const isEmpty = first === undefined;
  if (isEmpty) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0
    } satisfies OcrBox;
  }

  let left = first.x;
  let top = first.y;
  let right = first.x + first.width;
  let bottom = first.y + first.height;
  for (const box of rest) {
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.x + box.width);
    bottom = Math.max(bottom, box.y + box.height);
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  } satisfies OcrBox;
}
