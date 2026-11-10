import { alignmentCoordinates, dimensionOfVersion, hasVersionInformation } from "./qr-tables.ts";
import { BitMatrix } from "#src/barcode/bit-matrix.js";

const FINDER_AREA = 8;
const TIMING_LINE = 6;
const FORMAT_LINE = 8;
const ALIGNMENT_RADIUS = 2;
const VERSION_BLOCK_OFFSET = 11;
const VERSION_BLOCK_COLUMNS = 3;
const VERSION_BLOCK_ROWS = 6;
const FORMAT_BIT_COUNT = 15;
const FORMAT_FIRST_RUN = 6;
const FORMAT_SECOND_RUN = 8;
const FORMAT_THIRD_RUN = 9;
const FORMAT_LAST_BIT = 14;
const BITS_PER_CODEWORD = 8;
const COLUMN_PAIR_MASK = 2;

function markRectangle({ matrix, left, top, width, height }: {
  readonly matrix: BitMatrix;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}) {
  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) {
      matrix.setBlack({
        x,
        y
      });
    }
  }
}

/** The modules that are not data: finders, timing, alignment, format and version information. */
function functionPatterns(version: number) {
  const dimension = dimensionOfVersion(version);
  const matrix = new BitMatrix({
    width: dimension,
    height: dimension
  });
  const far = dimension - FINDER_AREA;
  markRectangle({
    matrix,
    left: 0,
    top: 0,
    width: FINDER_AREA + 1,
    height: FINDER_AREA + 1
  });
  markRectangle({
    matrix,
    left: far,
    top: 0,
    width: FINDER_AREA,
    height: FINDER_AREA + 1
  });
  markRectangle({
    matrix,
    left: 0,
    top: far,
    width: FINDER_AREA + 1,
    height: FINDER_AREA
  });
  markRectangle({
    matrix,
    left: TIMING_LINE,
    top: 0,
    width: 1,
    height: dimension
  });
  markRectangle({
    matrix,
    left: 0,
    top: TIMING_LINE,
    width: dimension,
    height: 1
  });
  const coordinates = alignmentCoordinates(version);
  const last = coordinates.length - 1;
  for (const [iRow, centerY] of coordinates.entries()) {
    for (const [iColumn, centerX] of coordinates.entries()) {
      const isFinderCorner = (iRow === 0 && (iColumn === 0 || iColumn === last)) || (iRow === last && iColumn === 0);
      if (isFinderCorner) {
        continue;
      }

      markRectangle({
        matrix,
        left: centerX - ALIGNMENT_RADIUS,
        top: centerY - ALIGNMENT_RADIUS,
        width: ALIGNMENT_RADIUS * 2 + 1,
        height: ALIGNMENT_RADIUS * 2 + 1
      });
    }
  }

  if (hasVersionInformation(version)) {
    const near = dimension - VERSION_BLOCK_OFFSET;
    markRectangle({
      matrix,
      left: near,
      top: 0,
      width: VERSION_BLOCK_COLUMNS,
      height: VERSION_BLOCK_ROWS
    });
    markRectangle({
      matrix,
      left: 0,
      top: near,
      width: VERSION_BLOCK_ROWS,
      height: VERSION_BLOCK_COLUMNS
    });
  }

  return matrix;
}

function stripColumns(dimension: number) {
  const columns: number[] = [];
  for (let right = dimension - 1; right > TIMING_LINE; right -= 2) {
    columns.push(right);
  }
  for (let right = TIMING_LINE - 1; right >= 1; right -= 2) {
    columns.push(right);
  }
  return columns;
}

function stripIndexes({ dimension, right, isFunction }: {
  readonly dimension: number;
  readonly right: number;
  readonly isFunction: BitMatrix;
}) {
  const indexes: number[] = [];
  const isUpward = ((right + 1) & COLUMN_PAIR_MASK) === 0;
  for (let step = 0; step < dimension; step++) {
    const y = isUpward ? dimension - 1 - step : step;
    for (const index of [y * dimension + right, y * dimension + right - 1]) {
      const isData = isFunction.bits[index] === 0;
      if (isData) {
        indexes.push(index);
      }
    }
  }
  return indexes;
}

/**
 * The linear index (`y * dimension + x`) of every data module, in the order the
 * codeword bits are laid out: two-column strips from the bottom right,
 * zigzagging up and down, skipping the vertical timing column.
 */
export function dataModuleIndexes(version: number) {
  const dimension = dimensionOfVersion(version);
  const isFunction = functionPatterns(version);
  return stripColumns(dimension).flatMap(right => stripIndexes({
    dimension,
    right,
    isFunction
  }));
}

/** The number of whole codewords a version holds, data and parity. */
export function codewordCount(version: number) {
  return Math.floor(dataModuleIndexes(version).length / BITS_PER_CODEWORD);
}

function firstFormatIndex({ bit, dimension }: {
  readonly bit: number;
  readonly dimension: number;
}) {
  const isBeforeTiming = bit < FORMAT_FIRST_RUN;
  if (isBeforeTiming) {
    return bit * dimension + FORMAT_LINE;
  }

  const isAfterCorner = bit >= FORMAT_THIRD_RUN;
  if (isAfterCorner) {
    return FORMAT_LINE * dimension + FORMAT_LAST_BIT - bit;
  }

  // The three bits that turn the corner at (8, 8): down the column, the corner, along the row.
  const corner = [
    (FORMAT_FIRST_RUN + 1) * dimension + FORMAT_LINE,
    FORMAT_LINE * dimension + FORMAT_LINE,
    FORMAT_LINE * dimension + FORMAT_FIRST_RUN + 1
  ];
  return corner[bit - FORMAT_FIRST_RUN] ?? 0;
}

function secondFormatIndex({ bit, dimension }: {
  readonly bit: number;
  readonly dimension: number;
}) {
  const isLowByte = bit < FORMAT_SECOND_RUN;
  return isLowByte
    ? FORMAT_LINE * dimension + dimension - 1 - bit
    : (dimension - FORMAT_BIT_COUNT + bit) * dimension + FORMAT_LINE;
}

/**
 * The linear indexes of the 15 format information bits, least significant
 * first, in the copy around the top-left finder and the copy split between the
 * other two finders.
 */
export function formatBitIndexes(dimension: number) {
  const bits = Array.from({ length: FORMAT_BIT_COUNT }, (_, bit) => bit);
  return {
    first: bits.map(bit => firstFormatIndex({
      bit,
      dimension
    })),
    second: bits.map(bit => secondFormatIndex({
      bit,
      dimension
    }))
  };
}
