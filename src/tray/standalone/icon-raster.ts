import { BYTES_PER_PIXEL } from "#src/win32-icons.js";
import type { IconPixels } from "#src/win32-icons.js";

// The pixel work of a menu icon, as plain functions over bytes so that it is tested without Windows:
// tinting, dimming and the premultiplied-alpha square a menu bitmap holds.

const BLUE = 0;
const GREEN = 1;
const RED = 2;
const DOT_RADIUS_SHARE = 0.14;
const STRIP_SHARE = 0.5;
const HALF_PIXEL = 0.5;
const ALPHA = 3;
const BYTE_MAX = 255;
const RED_WEIGHT = 0.299;
const GREEN_WEIGHT = 0.587;
const BLUE_WEIGHT = 0.114;

const GREEN_SHIFT = 8;
const RED_SHIFT = 16;

function channelsOf(rgb: number) {
  return [rgb & BYTE_MAX, rgb >> GREEN_SHIFT & BYTE_MAX, rgb >> RED_SHIFT & BYTE_MAX] as const;
}

/** How much of its alpha a disabled item's icon keeps. */
export const DISABLED_ALPHA = 0.45;

/** An image of any shape; `bgra` is `width * height * 4` bytes, blue first, straight (not premultiplied) alpha. */
export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly bgra: Uint8Array;
}

/**
 * The raster of square icon pixels.
 *
 * @param pixels - Square BGRA pixels.
 * @returns The same pixels as a raster.
 */
export function rasterOf({ size, bgra }: IconPixels) {
  return {
    width: size,
    height: size,
    bgra
  };
}

/**
 * Paints a raster in one color and keeps its alpha, so a monochrome glyph takes the menu's text color.
 *
 * @param options - `raster`: the glyph; `rgb`: the color as 0xRRGGBB.
 * @returns The recolored raster.
 */
export function tintedRaster({ raster, rgb }: {
  readonly raster: Raster;
  readonly rgb: number;
}) {
  const bgra = new Uint8Array(raster.bgra);
  const [blue, green, red] = channelsOf(rgb);
  for (let i = 0; i < bgra.length; i += BYTES_PER_PIXEL) {
    bgra[i + BLUE] = blue;
    bgra[i + GREEN] = green;
    bgra[i + RED] = red;
  }

  return {
    ...raster,
    bgra
  };
}

/**
 * The look of a disabled item: the colors turned to grey and the alpha lowered.
 *
 * @param raster - The enabled picture.
 * @returns The dimmed raster.
 */
export function dimmedRaster(raster: Raster) {
  const bgra = new Uint8Array(raster.bgra);
  for (let i = 0; i < bgra.length; i += BYTES_PER_PIXEL) {
    const grey = Math.round(
      (bgra[i + RED] ?? 0) * RED_WEIGHT + (bgra[i + GREEN] ?? 0) * GREEN_WEIGHT + (bgra[i + BLUE] ?? 0) * BLUE_WEIGHT
    );
    bgra[i + BLUE] = grey;
    bgra[i + GREEN] = grey;
    bgra[i + RED] = grey;
    bgra[i + ALPHA] = Math.round((bgra[i + ALPHA] ?? 0) * DISABLED_ALPHA);
  }

  return {
    ...raster,
    bgra
  };
}

function overlap({ low, high, index }: {
  readonly low: number;
  readonly high: number;
  readonly index: number;
}) {
  return Math.max(0, Math.min(high, index + 1) - Math.max(low, index));
}

function averaged({ raster, left, top, right, bottom }: {
  readonly raster: Raster;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}) {
  const sum = [0, 0, 0, 0];
  let area = 0;
  const lastX = Math.min(raster.width, Math.ceil(right));
  const lastY = Math.min(raster.height, Math.ceil(bottom));
  for (let y = Math.max(0, Math.floor(top)); y < lastY; y++) {
    const rowWeight = overlap({
      low: top,
      high: bottom,
      index: y
    });
    for (let x = Math.max(0, Math.floor(left)); x < lastX; x++) {
      const weight = rowWeight * overlap({
        low: left,
        high: right,
        index: x
      });
      const offset = (y * raster.width + x) * BYTES_PER_PIXEL;
      const alpha = (raster.bgra[offset + ALPHA] ?? 0) / BYTE_MAX;
      sum[BLUE] = (sum[BLUE] ?? 0) + weight * alpha * (raster.bgra[offset + BLUE] ?? 0);
      sum[GREEN] = (sum[GREEN] ?? 0) + weight * alpha * (raster.bgra[offset + GREEN] ?? 0);
      sum[RED] = (sum[RED] ?? 0) + weight * alpha * (raster.bgra[offset + RED] ?? 0);
      sum[ALPHA] = (sum[ALPHA] ?? 0) + weight * alpha * BYTE_MAX;
      area += weight;
    }
  }

  return {
    sum,
    area
  };
}

/**
 * The raster fitted into a `size` square, centered and with its aspect kept, as the premultiplied-alpha
 * BGRA bytes a menu bitmap holds. A square raster of exactly `size` is converted without resampling; any
 * other is averaged over the source area each pixel covers, so a shrunk icon stays smooth.
 *
 * @param options - `raster`: the picture; `size`: the side of the square, in pixels.
 * @returns `size * size * 4` bytes.
 */
export function premultipliedSquare({ raster, size }: {
  readonly raster: Raster;
  readonly size: number;
}) {
  const out = new Uint8Array(size * size * BYTES_PER_PIXEL);
  const scale = size / Math.max(raster.width, raster.height);
  const offsetX = (size - raster.width * scale) / 2;
  const offsetY = (size - raster.height * scale) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const { sum, area } = averaged({
        raster,
        left: (x - offsetX) / scale,
        top: (y - offsetY) / scale,
        right: (x + 1 - offsetX) / scale,
        bottom: (y + 1 - offsetY) / scale
      });
      const offset = (y * size + x) * BYTES_PER_PIXEL;
      const isCovered = area > 0;
      for (let channel = 0; isCovered && channel < BYTES_PER_PIXEL; channel++) {
        out[offset + channel] = Math.round((sum[channel] ?? 0) / area);
      }
    }
  }

  return out;
}

/**
 * Puts a premultiplied square after a strip of its own and, for a ticked line, a dot in the middle of that
 * strip: how a ticked line with an icon shows its tick, because Windows draws the icon where the check
 * mark would be. The strip is there for every line, so the icons and the text keep their alignment.
 *
 * @param options - `bytes`: the premultiplied square; `size`: its side; `rgb`: the dot's color; `alpha`: its
 * opacity from 0 to 1; `isTicked`: whether to draw the dot.
 * @returns The pixels of a bitmap `size` high and `stripWidthOf(size) + size` wide.
 */
export function tickedRow({ bytes, size, rgb, alpha, isTicked }: {
  readonly bytes: Uint8Array;
  readonly size: number;
  readonly rgb: number;
  readonly alpha: number;
  readonly isTicked: boolean;
}) {
  const strip = stripWidthOf(size);
  const width = strip + size;
  const out = new Uint8Array(width * size * BYTES_PER_PIXEL);
  const radius = size * DOT_RADIUS_SHARE;
  const dot = channelsOf(rgb);
  for (let y = 0; y < size; y++) {
    const row = y * width * BYTES_PER_PIXEL;
    const source = y * size * BYTES_PER_PIXEL;
    out.set(bytes.subarray(source, source + size * BYTES_PER_PIXEL), row + strip * BYTES_PER_PIXEL);
    for (let x = 0; isTicked && x < strip; x++) {
      const distance = Math.hypot(x + HALF_PIXEL - strip / 2, y + HALF_PIXEL - size / 2);
      const weight = Math.min(1, Math.max(0, radius + HALF_PIXEL - distance)) * alpha;
      for (let channel = 0; channel < BYTES_PER_PIXEL; channel++) {
        const over = channel === ALPHA ? BYTE_MAX : dot[channel] ?? 0;
        out[row + x * BYTES_PER_PIXEL + channel] = Math.round(over * weight);
      }
    }
  }

  return out;
}

/**
 * The width of the strip `tickedRow` puts before an icon of this side.
 *
 * @param size - The icon's side.
 * @returns The strip's width in pixels.
 */
export function stripWidthOf(size: number) {
  return Math.ceil(size * STRIP_SHARE);
}
