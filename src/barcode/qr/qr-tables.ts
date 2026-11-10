// ISO/IEC 18004 table 9 (error correction characteristics), one row per
// level in the order L, M, Q, H and one entry per version 1 to 40. A string
// because a table of bare numbers would be a table of magic numbers.
const PARITY_PER_BLOCK = [
  "7 10 15 20 26 18 20 24 30 18 20 24 26 30 22 24 28 30 28 28 28 28 30 30 26 28 30 30 30 30 30 30 30 30 30 30 30 30 30 30",
  "10 16 26 18 24 16 18 22 22 26 30 22 22 24 24 28 28 26 26 26 26 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28",
  "13 22 18 26 18 24 18 22 20 24 28 26 24 20 30 24 28 28 26 30 28 30 30 30 30 28 30 30 30 30 30 30 30 30 30 30 30 30 30 30",
  "17 28 22 16 22 28 26 26 24 28 24 28 22 24 24 30 28 28 26 28 30 24 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30"
];

const BLOCK_COUNT = [
  "1 1 1 1 1 2 2 2 2 4 4 4 4 4 6 6 6 6 7 8 8 9 9 10 12 12 12 13 14 15 16 17 18 19 19 20 21 22 24 25",
  "1 1 1 2 2 4 4 4 5 5 5 8 9 9 10 10 11 13 14 16 17 17 18 20 21 23 25 26 28 29 31 33 35 37 38 40 43 45 47 49",
  "1 1 2 2 4 4 6 6 8 8 8 10 12 16 12 17 16 18 21 20 23 23 25 27 29 34 34 35 38 40 43 45 48 51 53 56 59 62 65 68",
  "1 1 2 4 4 4 5 6 8 8 11 11 16 16 18 16 19 21 25 25 25 34 30 32 35 37 40 42 45 48 51 54 57 60 63 66 70 74 77 81"
];

// The two bits in a symbol's format information that name each level L, M, Q, H.
const FORMAT_BITS_OF_LEVEL = "1 0 3 2";

const FIRST_VERSION_DIMENSION = 21;
const DIMENSION_STEP = 4;
const LARGEST_VERSION = 40;
const ALIGNMENT_VERSION_DIVISOR = 7;
const ALIGNMENT_SPECIAL_VERSION = 32;
const ALIGNMENT_SPECIAL_STEP = 26;
const FINDER_TO_ALIGNMENT_EDGE = 7;
const TIMING_COORDINATE = 6;
const ALIGNMENT_STEP_BASE = 4;
const VERSION_INFORMATION_FIRST_VERSION = 7;

function numberAt({ table, index }: {
  readonly table: string;
  readonly index: number;
}) {
  return Number(table.split(" ")[index]);
}

/** The error correction levels, indexed as the tables are: L, M, Q, H. */
export const ErrorCorrectionLevel = {
  LOW: 0,
  MEDIUM: 1,
  QUARTILE: 2,
  HIGH: 3
} as const;

/** The two format information bits that name `level`. */
export function formatBitsOfLevel(level: number) {
  return numberAt({
    table: FORMAT_BITS_OF_LEVEL,
    index: level
  });
}

/** The side of a symbol, in modules. */
export function dimensionOfVersion(version: number) {
  return FIRST_VERSION_DIMENSION + DIMENSION_STEP * (version - 1);
}

/** The version of a symbol with this side, or -1 when no version has it. */
export function versionOfDimension(dimension: number) {
  const version = (dimension - FIRST_VERSION_DIMENSION) / DIMENSION_STEP + 1;
  const isValid = Number.isInteger(version) && version >= 1 && version <= LARGEST_VERSION;
  return isValid ? version : -1;
}

/** Whether a symbol of this version also carries version information. */
export function hasVersionInformation(version: number) {
  return version >= VERSION_INFORMATION_FIRST_VERSION;
}

/**
 * The centre coordinates of the alignment patterns along one axis (every pair
 * of them, minus the three that would overlap a finder pattern, is a pattern).
 */
export function alignmentCoordinates(version: number) {
  const isSingle = version === 1;
  if (isSingle) {
    return [];
  }

  const dimension = dimensionOfVersion(version);
  const count = Math.floor(version / ALIGNMENT_VERSION_DIVISOR) + 2;
  const isSpecial = version === ALIGNMENT_SPECIAL_VERSION;
  const step = isSpecial
    ? ALIGNMENT_SPECIAL_STEP
    : Math.ceil((version * ALIGNMENT_STEP_BASE + ALIGNMENT_STEP_BASE) / (count * 2 - 2)) * 2;
  const coordinates = [TIMING_COORDINATE];
  for (let coordinate = dimension - FINDER_TO_ALIGNMENT_EDGE; coordinates.length < count; coordinate -= step) {
    coordinates.splice(1, 0, coordinate);
  }
  return coordinates;
}

/** The parity codewords of each error correction block of a version at a level. */
export function parityPerBlock({ version, level }: {
  readonly version: number;
  readonly level: number;
}) {
  return numberAt({
    table: PARITY_PER_BLOCK[level] ?? "",
    index: version - 1
  });
}

/** The number of error correction blocks of a version at a level. */
export function blockCount({ version, level }: {
  readonly version: number;
  readonly level: number;
}) {
  return numberAt({
    table: BLOCK_COUNT[level] ?? "",
    index: version - 1
  });
}
