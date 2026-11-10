import { BitMatrix } from "#src/barcode/bit-matrix.js";
import { alphaPower, multiply } from "#src/barcode/qr/galois-field.js";
import { blockLayout } from "#src/barcode/qr/qr-decode.js";
import { encodeFormatBits } from "#src/barcode/qr/qr-format.js";
import { codewordCount } from "#src/barcode/qr/qr-layout.js";
import { alignmentCoordinates, dimensionOfVersion, ErrorCorrectionLevel } from "#src/barcode/qr/qr-tables.js";

// A minimal QR encoder (model 2) written from ISO/IEC 18004, only to make
// symbols for the decoder's tests. It draws the function patterns on its own
// and shares only the block table, the field arithmetic and the format word
// with the decoder; the Python-made fixtures check those.

const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const PAD_BYTES = [0xec, 0x11];
const COUNT_BITS = {
  numeric: [10, 12, 14],
  alphanumeric: [9, 11, 13],
  byte: [8, 16, 16]
};
const VERSION_INFO_FIRST = 7;
const LARGEST_VERSION = 40;

export interface EncodeOptions {
  readonly text: string;
  readonly level?: number;
  readonly version?: number;
  readonly mask?: number;
}

interface Position {
  readonly x: number;
  readonly y: number;
}

class BitBuffer {
  readonly bits: number[] = [];

  append({ value, count }: {
    readonly value: number;
    readonly count: number;
  }) {
    for (let i = count - 1; i >= 0; i--) {
      this.bits.push(Math.floor(value / 2 ** i) % 2);
    }
  }
}

function countBits({ mode, version }: {
  readonly mode: keyof typeof COUNT_BITS;
  readonly version: number;
}) {
  const index = Number(version > 9) + Number(version > 26);
  return COUNT_BITS[mode][index] ?? 8;
}

function numericSegment({ text, buffer, version }: {
  readonly text: string;
  readonly buffer: BitBuffer;
  readonly version: number;
}) {
  buffer.append({
    value: 1,
    count: 4
  });
  buffer.append({
    value: text.length,
    count: countBits({
      mode: "numeric",
      version
    })
  });
  for (let i = 0; i < text.length; i += 3) {
    const group = text.slice(i, i + 3);
    buffer.append({
      value: Number(group),
      count: group.length * 3 + 1
    });
  }
}

function alphanumericSegment({ text, buffer, version }: {
  readonly text: string;
  readonly buffer: BitBuffer;
  readonly version: number;
}) {
  buffer.append({
    value: 2,
    count: 4
  });
  buffer.append({
    value: text.length,
    count: countBits({
      mode: "alphanumeric",
      version
    })
  });
  for (let i = 0; i < text.length; i += 2) {
    const pair = text.slice(i, i + 2);
    const isPair = pair.length === 2;
    const first = ALPHANUMERIC.indexOf(pair.charAt(0));
    buffer.append({
      value: isPair ? first * ALPHANUMERIC.length + ALPHANUMERIC.indexOf(pair.charAt(1)) : first,
      count: isPair ? 11 : 6
    });
  }
}

function byteSegment({ text, buffer, version }: {
  readonly text: string;
  readonly buffer: BitBuffer;
  readonly version: number;
}) {
  const bytes = new TextEncoder().encode(text);
  buffer.append({
    value: 4,
    count: 4
  });
  buffer.append({
    value: bytes.length,
    count: countBits({
      mode: "byte",
      version
    })
  });
  for (const byte of bytes) {
    buffer.append({
      value: byte,
      count: 8
    });
  }
}

function segmentOf({ text, version }: {
  readonly text: string;
  readonly version: number;
}) {
  const buffer = new BitBuffer();
  const isNumeric = /^[0-9]+$/u.test(text);
  const isAlphanumeric = Array.from(text).every(character => ALPHANUMERIC.includes(character));
  if (isNumeric) {
    numericSegment({
      text,
      buffer,
      version
    });
  } else if (isAlphanumeric) {
    alphanumericSegment({
      text,
      buffer,
      version
    });
  } else {
    byteSegment({
      text,
      buffer,
      version
    });
  }

  return buffer;
}

function dataCodewordsOf({ buffer, capacity }: {
  readonly buffer: BitBuffer;
  readonly capacity: number;
}) {
  const bits = [...buffer.bits];
  const terminator = Math.min(4, capacity * 8 - bits.length);
  bits.push(...Array.from({ length: terminator }, () => 0));
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (const bit of bits.slice(i, i + 8)) {
      value = value * 2 + bit;
    }
    bytes.push(value);
  }
  for (let i = 0; bytes.length < capacity; i++) {
    bytes.push(PAD_BYTES[i % 2] ?? 0);
  }
  return bytes;
}

function parityOf({ data, count }: {
  readonly data: readonly number[];
  readonly count: number;
}) {
  let generator = [1];
  for (let power = 0; power < count; power++) {
    const next = Array.from({ length: generator.length + 1 }, () => 0);
    for (const [i, coefficient] of generator.entries()) {
      next[i + 1] = (next[i + 1] ?? 0) ^ coefficient;
      next[i] = (next[i] ?? 0) ^ multiply({
        left: coefficient,
        right: alphaPower(power)
      });
    }
    generator = next;
  }
  // The generator is lowest degree first and monic; divide data * x^count by it.
  const remainder = Array.from({ length: count }, () => 0);
  for (const byte of data) {
    const factor = byte ^ (remainder.shift() ?? 0);
    remainder.push(0);
    for (let i = 0; i < count; i++) {
      remainder[i] = (remainder[i] ?? 0) ^ multiply({
        left: generator[count - 1 - i] ?? 0,
        right: factor
      });
    }
  }
  return remainder;
}

function interleave({ data, version, level }: {
  readonly data: readonly number[];
  readonly version: number;
  readonly level: number;
}) {
  const { parity, dataSizes } = blockLayout({
    version,
    level
  });
  const blocks: number[][] = [];
  const parities: number[][] = [];
  let offset = 0;
  for (const size of dataSizes) {
    const block = data.slice(offset, offset + size);
    offset += size;
    blocks.push(block);
    parities.push(
      parityOf({
        data: block,
        count: parity
      })
    );
  }
  const result: number[] = [];
  for (let i = 0; i < Math.max(...dataSizes); i++) {
    const column = blocks.flatMap(block => i < block.length ? [block[i] ?? 0] : []);
    result.push(...column);
  }
  for (let i = 0; i < parity; i++) {
    result.push(...parities.map(block => block[i] ?? 0));
  }
  return result;
}

function bchVersion(version: number) {
  let remainder = version;
  for (let i = 0; i < 12; i++) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }
  return (version << 12) | remainder;
}

function maskApplies({ mask, x, y }: {
  readonly mask: number;
  readonly x: number;
  readonly y: number;
}) {
  const masks = [
    (x + y) % 2 === 0,
    y % 2 === 0,
    x % 3 === 0,
    (x + y) % 3 === 0,
    (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    ((x * y) % 2) + ((x * y) % 3) === 0,
    (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
  ];
  return masks[mask] ?? false;
}

class ModuleGrid {
  readonly dimension: number;
  readonly dark: boolean[][];
  readonly isFunction: boolean[][];

  constructor(dimension: number) {
    this.dimension = dimension;
    this.dark = Array.from({ length: dimension }, () => Array.from({ length: dimension }, () => false));
    this.isFunction = Array.from({ length: dimension }, () => Array.from({ length: dimension }, () => false));
  }

  setFunction({ x, y, isDark }: {
    readonly x: number;
    readonly y: number;
    readonly isDark: boolean;
  }) {
    const row = this.dark[y];
    const functionRow = this.isFunction[y];
    const hasRows = row !== undefined && functionRow !== undefined;
    if (hasRows) {
      row[x] = isDark;
      functionRow[x] = true;
    }
  }

  isFree({ x, y }: Position) {
    return this.isFunction[y]?.[x] === false;
  }

  setData({ x, y, isDark }: {
    readonly x: number;
    readonly y: number;
    readonly isDark: boolean;
  }) {
    const row = this.dark[y];
    if (row) {
      row[x] = isDark;
    }
  }
}

function drawTiming(symbol: ModuleGrid) {
  for (let i = 0; i < symbol.dimension; i++) {
    symbol.setFunction({
      x: 6,
      y: i,
      isDark: i % 2 === 0
    });
    symbol.setFunction({
      x: i,
      y: 6,
      isDark: i % 2 === 0
    });
  }
}

function drawFinder({ symbol, center }: {
  readonly symbol: ModuleGrid;
  readonly center: Position;
}) {
  for (let offsetY = -4; offsetY <= 4; offsetY++) {
    for (let offsetX = -4; offsetX <= 4; offsetX++) {
      const ring = Math.max(Math.abs(offsetX), Math.abs(offsetY));
      const x = center.x + offsetX;
      const y = center.y + offsetY;
      const isInside = x >= 0 && x < symbol.dimension && y >= 0 && y < symbol.dimension;
      if (isInside) {
        symbol.setFunction({
          x,
          y,
          isDark: ring !== 2 && ring !== 4
        });
      }
    }
  }
}

function drawAlignment({ symbol, center }: {
  readonly symbol: ModuleGrid;
  readonly center: Position;
}) {
  for (let offsetY = -2; offsetY <= 2; offsetY++) {
    for (let offsetX = -2; offsetX <= 2; offsetX++) {
      symbol.setFunction({
        x: center.x + offsetX,
        y: center.y + offsetY,
        isDark: Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== 1
      });
    }
  }
}

function drawFunctionPatterns({ symbol, version }: {
  readonly symbol: ModuleGrid;
  readonly version: number;
}) {
  const { dimension } = symbol;
  drawTiming(symbol);
  for (const center of [
    {
      x: 3,
      y: 3
    },
    {
      x: dimension - 4,
      y: 3
    },
    {
      x: 3,
      y: dimension - 4
    }
  ]) {
    drawFinder({
      symbol,
      center
    });
  }
  const coordinates = alignmentCoordinates(version);
  const last = coordinates.length - 1;
  for (const [iRow, y] of coordinates.entries()) {
    for (const [iColumn, x] of coordinates.entries()) {
      const isOnTopRow = iRow === 0 && (iColumn === 0 || iColumn === last);
      const isOnFinder = isOnTopRow || (iRow === last && iColumn === 0);
      if (!isOnFinder) {
        drawAlignment({
          symbol,
          center: {
            x,
            y
          }
        });
      }
    }
  }
}

function drawFormat({ symbol, level, mask }: {
  readonly symbol: ModuleGrid;
  readonly level: number;
  readonly mask: number;
}) {
  const { dimension } = symbol;
  const format = encodeFormatBits({
    level,
    mask
  });
  function place({ x, y, bit }: Position & { readonly bit: number }) {
    symbol.setFunction({
      x,
      y,
      isDark: ((format >>> bit) & 1) === 1
    });
  }
  for (let bit = 0; bit <= 5; bit++) {
    place({
      x: 8,
      y: bit,
      bit
    });
  }
  place({
    x: 8,
    y: 7,
    bit: 6
  });
  place({
    x: 8,
    y: 8,
    bit: 7
  });
  place({
    x: 7,
    y: 8,
    bit: 8
  });
  for (let bit = 9; bit < 15; bit++) {
    place({
      x: 14 - bit,
      y: 8,
      bit
    });
  }
  for (let bit = 0; bit < 8; bit++) {
    place({
      x: dimension - 1 - bit,
      y: 8,
      bit
    });
  }
  for (let bit = 8; bit < 15; bit++) {
    place({
      x: 8,
      y: dimension - 15 + bit,
      bit
    });
  }
  symbol.setFunction({
    x: 8,
    y: dimension - 8,
    isDark: true
  });
}

function drawVersion({ symbol, version }: {
  readonly symbol: ModuleGrid;
  readonly version: number;
}) {
  const info = bchVersion(version);
  for (let i = 0; i < 18; i++) {
    const isDark = ((info >>> i) & 1) === 1;
    symbol.setFunction({
      x: symbol.dimension - 11 + (i % 3),
      y: Math.floor(i / 3),
      isDark
    });
    symbol.setFunction({
      x: Math.floor(i / 3),
      y: symbol.dimension - 11 + (i % 3),
      isDark
    });
  }
}

// The free modules in the order the bits go: two-column strips from the bottom right, up and down.
function dataPositions(symbol: ModuleGrid) {
  const { dimension } = symbol;
  const columns: number[] = [];
  for (let right = dimension - 1; right > 6; right -= 2) {
    columns.push(right);
  }
  for (let right = 5; right >= 1; right -= 2) {
    columns.push(right);
  }
  const positions: Position[] = [];
  for (const column of columns) {
    const isUpward = ((column + 1) & 2) === 0;
    for (let vertical = 0; vertical < dimension; vertical++) {
      const y = isUpward ? dimension - 1 - vertical : vertical;
      positions.push({
        x: column,
        y
      }, {
        x: column - 1,
        y
      });
    }
  }
  return positions.filter(position => symbol.isFree(position));
}

function placeData({ symbol, codewords, mask }: {
  readonly symbol: ModuleGrid;
  readonly codewords: readonly number[];
  readonly mask: number;
}) {
  for (const [iBit, { x, y }] of dataPositions(symbol).entries()) {
    const byte = codewords[iBit >> 3] ?? 0;
    const isBitSet = ((byte >>> (7 - (iBit & 7))) & 1) === 1;
    symbol.setData({
      x,
      y,
      isDark: isBitSet !== maskApplies({
        mask,
        x,
        y
      })
    });
  }
}

export function encodeQr(options: EncodeOptions) {
  const level = options.level ?? ErrorCorrectionLevel.MEDIUM;
  const mask = options.mask ?? 2;
  function capacityOf(candidate: number) {
    const { parity, dataSizes } = blockLayout({
      version: candidate,
      level
    });
    return codewordCount(candidate) - parity * dataSizes.length;
  }
  let version = options.version ?? 1;
  let buffer = segmentOf({
    text: options.text,
    version
  });
  const isFixed = options.version !== undefined;
  while (!isFixed && version < LARGEST_VERSION && buffer.bits.length > capacityOf(version) * 8) {
    version++;
    buffer = segmentOf({
      text: options.text,
      version
    });
  }
  const isTooLarge = buffer.bits.length > capacityOf(version) * 8;
  if (isTooLarge) {
    throw new RangeError("the text does not fit the symbol");
  }

  const data = dataCodewordsOf({
    buffer,
    capacity: capacityOf(version)
  });
  const symbol = new ModuleGrid(dimensionOfVersion(version));
  drawFunctionPatterns({
    symbol,
    version
  });
  drawFormat({
    symbol,
    level,
    mask
  });
  const hasVersionInfo = version >= VERSION_INFO_FIRST;
  if (hasVersionInfo) {
    drawVersion({
      symbol,
      version
    });
  }

  placeData({
    symbol,
    codewords: interleave({
      data,
      version,
      level
    }),
    mask
  });
  const grid = new BitMatrix({
    width: symbol.dimension,
    height: symbol.dimension
  });
  for (const [y, row] of symbol.dark.entries()) {
    for (const [x, isDark] of row.entries()) {
      if (isDark) {
        grid.setBlack({
          x,
          y
        });
      }
    }
  }
  return {
    grid,
    version
  };
}
