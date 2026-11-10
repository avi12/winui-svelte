import { formatBitIndexes } from "./qr-layout.ts";
import { formatBitsOfLevel } from "./qr-tables.ts";
import type { BitMatrix } from "#src/barcode/bit-matrix.js";

const FORMAT_GENERATOR = 0x537;
const FORMAT_MASK = 0x5412;
const FORMAT_CHECK_BITS = 10;
const FORMAT_BIT_COUNT = 15;
const MASK_BITS = 3;
const MASK_COUNT = 8;
const LEVEL_COUNT = 4;
const MAXIMUM_BIT_ERRORS = 3;

/** What a symbol's format information says. */
export interface QrFormat {
  /** An `ErrorCorrectionLevel` value. */
  readonly level: number;
  /** The data mask pattern, 0 to 7. */
  readonly mask: number;
}

/** The 15 format bits for a level and mask: BCH(15,5) check bits, then the fixed XOR mask. */
export function encodeFormatBits({ level, mask }: QrFormat) {
  const data = (formatBitsOfLevel(level) << MASK_BITS) | mask;
  let remainder = data << FORMAT_CHECK_BITS;
  for (let bit = FORMAT_BIT_COUNT - 1; bit >= FORMAT_CHECK_BITS; bit--) {
    const isSet = ((remainder >> bit) & 1) === 1;
    if (isSet) {
      remainder ^= FORMAT_GENERATOR << (bit - FORMAT_CHECK_BITS);
    }
  }
  return ((data << FORMAT_CHECK_BITS) | remainder) ^ FORMAT_MASK;
}

function bitCount(value: number) {
  let remaining = value;
  let count = 0;
  while (remaining !== 0) {
    count += remaining & 1;
    remaining >>>= 1;
  }
  return count;
}

function bitsAt({ matrix, indexes }: {
  readonly matrix: BitMatrix;
  readonly indexes: readonly number[];
}) {
  let bits = 0;
  for (const [bit, index] of indexes.entries()) {
    bits |= (matrix.bits[index] ?? 0) << bit;
  }
  return bits;
}

function formatWords() {
  const words: Array<{
    readonly level: number;
    readonly mask: number;
    readonly word: number;
  }> = [];
  for (let level = 0; level < LEVEL_COUNT; level++) {
    for (let mask = 0; mask < MASK_COUNT; mask++) {
      words.push({
        level,
        mask,
        word: encodeFormatBits({
          level,
          mask
        })
      });
    }
  }
  return words;
}

/**
 * Reads the format information from both of its copies and returns the
 * closest valid word within three bit errors, or `undefined`.
 */
export function readFormat(matrix: BitMatrix) {
  const { first, second } = formatBitIndexes(matrix.width);
  const copies = [
    bitsAt({
      matrix,
      indexes: first
    }),
    bitsAt({
      matrix,
      indexes: second
    })
  ];
  let best: QrFormat | undefined;
  let bestDistance = MAXIMUM_BIT_ERRORS + 1;
  for (const { level, mask, word } of formatWords()) {
    for (const copy of copies) {
      const distance = bitCount(copy ^ word);
      const isCloser = distance < bestDistance;
      if (isCloser) {
        bestDistance = distance;
        best = {
          level,
          mask
        };
      }
    }
  }
  return best;
}
