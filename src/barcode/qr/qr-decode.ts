import { parseBitstream } from "./qr-bitstream.ts";
import { readFormat } from "./qr-format.ts";
import { codewordCount, dataModuleIndexes } from "./qr-layout.ts";
import { blockCount, parityPerBlock, versionOfDimension } from "./qr-tables.ts";
import { correctErrors } from "./reed-solomon.ts";
import type { Point } from "#src/barcode/barcode-types.js";
import type { BitMatrix } from "#src/barcode/bit-matrix.js";

const BITS_PER_CODEWORD = 8;
const MASK_PERIOD = 3;
const ROW_PERIOD = 2;

// ISO/IEC 18004 table 10: the eight data mask patterns, true where a module flips.
const MASK_CONDITIONS: readonly ((position: Point) => boolean)[] = [
  ({ x, y }) => (x + y) % 2 === 0,
  ({ y }) => y % 2 === 0,
  ({ x }) => x % MASK_PERIOD === 0,
  ({ x, y }) => (x + y) % MASK_PERIOD === 0,
  ({ x, y }) => (Math.floor(x / MASK_PERIOD) + Math.floor(y / ROW_PERIOD)) % 2 === 0,
  ({ x, y }) => ((x * y) % 2) + ((x * y) % MASK_PERIOD) === 0,
  ({ x, y }) => (((x * y) % 2) + ((x * y) % MASK_PERIOD)) % 2 === 0,
  ({ x, y }) => (((x + y) % 2) + ((x * y) % MASK_PERIOD)) % 2 === 0
];

function readCodewords({ matrix, version, mask }: {
  readonly matrix: BitMatrix;
  readonly version: number;
  readonly mask: number;
}) {
  const indexes = dataModuleIndexes(version);
  const codewords = new Uint8Array(codewordCount(version));
  const isFlipped = MASK_CONDITIONS[mask] ?? (() => false);
  for (let iBit = 0; iBit < codewords.length * BITS_PER_CODEWORD; iBit++) {
    const index = indexes[iBit] ?? 0;
    const position = {
      x: index % matrix.width,
      y: Math.floor(index / matrix.width)
    };
    const isDark = matrix.bits[index] === 1;
    const bit = isDark === isFlipped(position) ? 0 : 1;
    const iCodeword = Math.floor(iBit / BITS_PER_CODEWORD);
    codewords[iCodeword] = ((codewords[iCodeword] ?? 0) << 1) | bit;
  }
  return codewords;
}

/** How a version at a level splits into blocks: each one's data codewords, and the parity codewords every block has. */
export function blockLayout({ version, level }: {
  readonly version: number;
  readonly level: number;
}) {
  const parity = parityPerBlock({
    version,
    level
  });
  const count = blockCount({
    version,
    level
  });
  const dataTotal = codewordCount(version) - parity * count;
  const shortSize = Math.floor(dataTotal / count);
  const longCount = dataTotal % count;
  const dataSizes = Array.from({ length: count }, (_, i) => i < count - longCount ? shortSize : shortSize + 1);
  return {
    parity,
    dataSizes
  };
}

// The codewords are interleaved: the first data codeword of every block, then the second, and so
// on, then the same for the parity.
function deinterleave({ codewords, parity, dataSizes }: {
  readonly codewords: Uint8Array;
  readonly parity: number;
  readonly dataSizes: readonly number[];
}) {
  const blocks = dataSizes.map(size => new Uint8Array(size + parity));
  let position = 0;
  const longest = Math.max(...dataSizes);
  for (let iColumn = 0; iColumn < longest + parity; iColumn++) {
    for (const [iBlock, size] of dataSizes.entries()) {
      const isParityColumn = iColumn >= longest;
      const target = isParityColumn ? size + iColumn - longest : iColumn;
      const isPresent = isParityColumn || iColumn < size;
      const block = blocks[iBlock];
      const isTarget = isPresent && block;
      if (isTarget) {
        block[target] = codewords[position] ?? 0;
        position++;
      }
    }
  }
  return blocks;
}

// The data codewords of a symbol after error correction, or `undefined` when a block is beyond repair.
function repairedData({ matrix, version }: {
  readonly matrix: BitMatrix;
  readonly version: number;
}) {
  const format = readFormat(matrix);
  if (!format) {
    return undefined;
  }

  const codewords = readCodewords({
    matrix,
    version,
    mask: format.mask
  });
  const { parity, dataSizes } = blockLayout({
    version,
    level: format.level
  });
  const blocks = deinterleave({
    codewords,
    parity,
    dataSizes
  });
  const data: number[] = [];
  for (const [iBlock, block] of blocks.entries()) {
    const repaired = correctErrors({
      codewords: block,
      parityCount: parity
    });
    if (!repaired) {
      return undefined;
    }

    data.push(...repaired.subarray(0, dataSizes[iBlock] ?? 0));
  }
  return Uint8Array.from(data);
}

/** Decodes a sampled symbol (one pixel per module, upright and unmirrored) to its text, or `undefined`. */
export function decodeQrMatrix(matrix: BitMatrix) {
  const version = versionOfDimension(matrix.width);
  const isSymbol = matrix.width === matrix.height && version > 0;
  if (!isSymbol) {
    return undefined;
  }

  const data = repairedData({
    matrix,
    version
  });
  return data
    ? parseBitstream({
      data,
      version
    })
    : undefined;
}
