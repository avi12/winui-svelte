import type { Size } from "./region.ts";

// Shrinking a picture on the CPU, for a frame that was captured at full size
// and is encoded smaller. Each output pixel is the mean of the source pixels
// it covers, a source pixel counted by how much of it falls inside: a bilinear
// filter whose footprint is stretched to the shrink step, which is what keeps
// small text from turning to sparkle that a plain two-by-two sample would.

const CHANNELS = 4;

interface Span {
  readonly first: number;
  readonly weights: Float64Array;
}

// For each target index, the source indexes it covers and their shares (summing to 1).
function spansOf({ source, target }: {
  readonly source: number;
  readonly target: number;
}) {
  const step = source / target;
  const spans: Span[] = [];
  for (let iTarget = 0; iTarget < target; iTarget++) {
    const low = iTarget * step;
    const high = low + step;
    const first = Math.floor(low);
    const last = Math.min(source - 1, Math.ceil(high) - 1);
    const weights = new Float64Array(last - first + 1);
    for (let iWeight = 0; iWeight < weights.length; iWeight++) {
      const iSource = first + iWeight;
      weights[iWeight] = (Math.min(iSource + 1, high) - Math.max(iSource, low)) / step;
    }

    spans.push({
      first,
      weights
    });
  }

  return spans;
}

function sumPixel({ pixels, width, row, column, sums }: {
  readonly pixels: Uint8Array | Uint8ClampedArray;
  readonly width: number;
  readonly row: Span;
  readonly column: Span;
  readonly sums: Float64Array;
}) {
  sums.fill(0);
  for (let iRow = 0; iRow < row.weights.length; iRow++) {
    const rowStart = (row.first + iRow) * width + column.first;
    const rowWeight = row.weights[iRow] ?? 0;
    for (let iColumn = 0; iColumn < column.weights.length; iColumn++) {
      const start = (rowStart + iColumn) * CHANNELS;
      const weight = rowWeight * (column.weights[iColumn] ?? 0);
      for (let channel = 0; channel < CHANNELS; channel++) {
        sums[channel] = (sums[channel] ?? 0) + (pixels[start + channel] ?? 0) * weight;
      }
    }
  }
}

/**
 * Shrinks four-channel pixels to a smaller size, whatever the channel order.
 *
 * @param options - The pixels and their size, and the size to make.
 * @returns A new array of `target.width * target.height * 4` bytes.
 * @throws {RangeError} when the pixels are not `size.width * size.height * 4` bytes
 */
export function shrinkPixels({ pixels, size, target }: {
  readonly pixels: Uint8Array | Uint8ClampedArray;
  readonly size: Size;
  readonly target: Size;
}) {
  const expected = size.width * size.height * CHANNELS;
  const isWrongLength = pixels.length !== expected;
  if (isWrongLength) {
    throw new RangeError(`${size.width} by ${size.height} pixels are ${expected} bytes, not ${pixels.length}`);
  }

  const columns = spansOf({
    source: size.width,
    target: target.width
  });
  const rows = spansOf({
    source: size.height,
    target: target.height
  });
  const shrunk = new Uint8Array(target.width * target.height * CHANNELS);
  const sums = new Float64Array(CHANNELS);
  for (const [yTarget, row] of rows.entries()) {
    for (const [xTarget, column] of columns.entries()) {
      sumPixel({
        pixels,
        width: size.width,
        row,
        column,
        sums
      });
      const out = (yTarget * target.width + xTarget) * CHANNELS;
      for (let channel = 0; channel < CHANNELS; channel++) {
        shrunk[out + channel] = Math.round(sums[channel] ?? 0);
      }
    }
  }

  return shrunk;
}
