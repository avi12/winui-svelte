import { BitMatrix } from "./bit-matrix.ts";

const RED_WEIGHT = 77;
const GREEN_WEIGHT = 150;
const BLUE_WEIGHT = 29;
const WEIGHT_SHIFT = 8;
const BYTES_PER_PIXEL = 4;
const LEVELS = 256;
const ADAPTIVE_DIVISOR = 8;
const MINIMUM_ADAPTIVE_RADIUS = 6;
const ADAPTIVE_PERCENT = 92;
const PERCENT = 100;

/** The luminance of a part of an RGBA image, one byte per pixel. */
export interface Luminance {
  readonly width: number;
  readonly height: number;
  readonly values: Uint8Array;
}

/** Converts the rectangle `area` of an RGBA image to luminance. */
export function toLuminance({ pixels, stride, area }: {
  readonly pixels: Uint8Array | Uint8ClampedArray;
  readonly stride: number;
  readonly area: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}) {
  const values = new Uint8Array(area.width * area.height);
  let iValue = 0;
  for (let y = area.y; y < area.y + area.height; y++) {
    let iPixel = (y * stride + area.x) * BYTES_PER_PIXEL;
    for (let x = 0; x < area.width; x++) {
      const red = pixels[iPixel] ?? 0;
      const green = pixels[iPixel + 1] ?? 0;
      const blue = pixels[iPixel + 2] ?? 0;
      values[iValue++] = (red * RED_WEIGHT + green * GREEN_WEIGHT + blue * BLUE_WEIGHT) >> WEIGHT_SHIFT;
      iPixel += BYTES_PER_PIXEL;
    }
  }
  return {
    width: area.width,
    height: area.height,
    values
  };
}

function otsuThreshold(values: Uint8Array) {
  const histogram = new Float64Array(LEVELS);
  for (const value of values) {
    histogram[value] = (histogram[value] ?? 0) + 1;
  }
  let totalSum = 0;
  for (let level = 0; level < LEVELS; level++) {
    totalSum += level * (histogram[level] ?? 0);
  }
  let backgroundCount = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let bestLevel = LEVELS / 2;
  for (let level = 0; level < LEVELS; level++) {
    const count = histogram[level] ?? 0;
    backgroundCount += count;
    backgroundSum += level * count;
    const foregroundCount = values.length - backgroundCount;
    const isDegenerate = backgroundCount === 0 || foregroundCount === 0;
    if (isDegenerate) {
      continue;
    }

    const backgroundMean = backgroundSum / backgroundCount;
    const foregroundMean = (totalSum - backgroundSum) / foregroundCount;
    const variance = backgroundCount * foregroundCount * (backgroundMean - foregroundMean) ** 2;
    const isBetter = variance > bestVariance;
    if (isBetter) {
      bestVariance = variance;
      bestLevel = level;
    }
  }
  return bestLevel;
}

/** Black at or below one global threshold (Otsu's): clean, evenly lit images. */
export function binarizeGlobal(luminance: Luminance) {
  const threshold = otsuThreshold(luminance.values);
  const matrix = new BitMatrix({
    width: luminance.width,
    height: luminance.height
  });
  for (let i = 0; i < luminance.values.length; i++) {
    const isBlack = (luminance.values[i] ?? 0) <= threshold;
    matrix.bits[i] = isBlack ? 1 : 0;
  }
  return matrix;
}

function integralImageOf({ width, height, values }: Luminance) {
  const columns = width + 1;
  const integral = new Float64Array(columns * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += values[y * width + x] ?? 0;
      integral[(y + 1) * columns + x + 1] = (integral[y * columns + x + 1] ?? 0) + rowSum;
    }
  }
  return integral;
}

/** Black below the mean of the surrounding window: uneven lighting and gradients. */
export function binarizeAdaptive(luminance: Luminance) {
  const { width, height, values } = luminance;
  const radius = Math.max(MINIMUM_ADAPTIVE_RADIUS, Math.round(Math.min(width, height) / ADAPTIVE_DIVISOR));
  const columns = width + 1;
  const integral = integralImageOf(luminance);
  const matrix = new BitMatrix({
    width,
    height
  });
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius);
      const right = Math.min(width, x + radius + 1);
      const sum = (integral[bottom * columns + right] ?? 0) - (integral[top * columns + right] ?? 0)
        - (integral[bottom * columns + left] ?? 0) + (integral[top * columns + left] ?? 0);
      const mean = sum / ((right - left) * (bottom - top));
      const isBlack = (values[y * width + x] ?? 0) < mean * ADAPTIVE_PERCENT / PERCENT;
      matrix.bits[y * width + x] = isBlack ? 1 : 0;
    }
  }
  return matrix;
}
