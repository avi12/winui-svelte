import { BitMatrix } from "./bit-matrix.ts";
import { blockLayout, decodeQrMatrix } from "./qr/qr-decode.ts";
import { readFormat } from "./qr/qr-format.ts";
import { codewordCount } from "./qr/qr-layout.ts";
import { alignmentCoordinates, ErrorCorrectionLevel } from "./qr/qr-tables.ts";
import { correctErrors } from "./qr/reed-solomon.ts";
import { encodeQr } from "./test-support/qr-encoder.ts";
import { QR_FIXTURES } from "./test-support/qr-fixtures.ts";
import { gridFromRows } from "./test-support/render.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The data codewords of every version at levels L, M, Q and H, and the number of
// error correction blocks, as the Python `qrcode` package tabulates them.
const DATA_CODEWORDS = [
  "19 34 55 80 108 136 156 194 232 274 324 370 428 461 523 589 647 721 795 861 932 1006 1094 1174 1276 1370 1468 1531 1631 1735 1843 1955 2071 2191 2306 2434 2566 2702 2812 2956",
  "16 28 44 64 86 108 124 154 182 216 254 290 334 365 415 453 507 563 627 669 714 782 860 914 1000 1062 1128 1193 1267 1373 1455 1541 1631 1725 1812 1914 1992 2102 2216 2334",
  "13 22 34 48 62 76 88 110 132 154 180 206 244 261 295 325 367 397 445 485 512 568 614 664 718 754 808 871 911 985 1033 1115 1171 1231 1286 1354 1426 1502 1582 1666",
  "9 16 26 36 46 60 66 86 100 122 140 158 180 197 223 253 283 313 341 385 406 442 464 514 538 596 628 661 701 745 793 845 901 961 986 1054 1096 1142 1222 1276"
];
const BLOCK_COUNTS = [
  "1 1 1 1 1 2 2 2 2 4 4 4 4 4 6 6 6 6 7 8 8 9 9 10 12 12 12 13 14 15 16 17 18 19 19 20 21 22 24 25",
  "1 1 1 2 2 4 4 4 5 5 5 8 9 9 10 10 11 13 14 16 17 17 18 20 21 23 25 26 28 29 31 33 35 37 38 40 43 45 47 49",
  "1 1 2 2 4 4 6 6 8 8 8 10 12 16 12 17 16 18 21 20 23 23 25 27 29 34 34 35 38 40 43 45 48 51 53 56 59 62 65 68",
  "1 1 2 4 4 4 5 6 8 8 11 11 16 16 18 16 19 21 25 25 25 34 30 32 35 37 40 42 45 48 51 54 57 60 63 66 70 74 77 81"
];
const ALIGNMENT = [
  "", "6 18", "6 22", "6 26", "6 30", "6 34", "6 22 38", "6 24 42", "6 26 46", "6 28 50", "6 30 54", "6 32 58", "6 34 62", "6 26 46 66",
  "6 26 48 70", "6 26 50 74", "6 30 54 78", "6 30 56 82", "6 30 58 86", "6 34 62 90", "6 28 50 72 94", "6 26 50 74 98", "6 30 54 78 102",
  "6 28 54 80 106", "6 32 58 84 110", "6 30 58 86 114", "6 34 62 90 118", "6 26 50 74 98 122", "6 30 54 78 102 126", "6 26 52 78 104 130",
  "6 30 56 82 108 134", "6 34 60 86 112 138", "6 30 58 86 114 142", "6 34 62 90 118 146", "6 30 54 78 102 126 150",
  "6 24 50 76 102 128 154", "6 28 54 80 106 132 158", "6 32 58 84 110 136 162", "6 26 54 82 110 138 166", "6 30 58 86 114 142 170"
];
const LEVELS = [
  ErrorCorrectionLevel.LOW,
  ErrorCorrectionLevel.MEDIUM,
  ErrorCorrectionLevel.QUARTILE,
  ErrorCorrectionLevel.HIGH
];
const LEVEL_NAMES = ["L", "M", "Q", "H"];
const VERSIONS = Array.from({ length: 40 }, (_, i) => i + 1);

function numbersOf(table: string | undefined) {
  return (table ?? "").split(" ").filter(Boolean).map(Number);
}

test("the block tables match the published capacities for every version and level", () => {
  for (const level of LEVELS) {
    for (const version of VERSIONS) {
      const { parity, dataSizes } = blockLayout({
        version,
        level
      });
      let dataTotal = 0;
      for (const size of dataSizes) {
        dataTotal += size;
      }
      assert.equal(dataTotal, numbersOf(DATA_CODEWORDS[level])[version - 1], `data codewords, version ${version} level ${LEVEL_NAMES[level]}`);
      assert.equal(dataSizes.length, numbersOf(BLOCK_COUNTS[level])[version - 1], `blocks, version ${version} level ${LEVEL_NAMES[level]}`);
      assert.equal(codewordCount(version), dataTotal + parity * dataSizes.length);
    }
  }
});

test("the alignment pattern positions match the standard for every version", () => {
  for (const version of VERSIONS) {
    assert.deepEqual(alignmentCoordinates(version), numbersOf(ALIGNMENT[version - 1]), `version ${version}`);
  }
});

test("codeword counts match the standard for known versions", () => {
  const expected = new Map([[1, 26], [2, 44], [3, 70], [7, 196], [10, 346], [40, 3706]]);
  for (const [version, count] of expected) {
    assert.equal(codewordCount(version), count, `version ${version}`);
  }
});

test("Reed-Solomon repairs up to half the parity in errors and refuses more", () => {
  const data = Uint8Array.from({ length: 40 }, (_, i) => (i * 37 + 11) % 256);
  const parityCount = 20;
  const clean = reedSolomon({
    data,
    parityCount
  });
  for (let errors = 0; errors <= parityCount / 2; errors++) {
    const damaged = Uint8Array.from(clean);
    for (let i = 0; i < errors; i++) {
      const position = (i * 7 + 3) % damaged.length;
      damaged[position] = (damaged[position] ?? 0) ^ (i + 1) * 29;
    }
    assert.deepEqual(
      correctErrors({
        codewords: damaged,
        parityCount
      }), clean, `${errors} errors`
    );
  }
  const ruined = Uint8Array.from(clean);
  for (let i = 0; i < parityCount / 2 + 3; i++) {
    ruined[i * 4] = (ruined[i * 4] ?? 0) ^ 0x55;
  }
  assert.equal(
    correctErrors({
      codewords: ruined,
      parityCount
    }), undefined
  );
});

function reedSolomon({ data, parityCount }: {
  readonly data: Uint8Array;
  readonly parityCount: number;
}) {
  // Polynomial division in GF(256), written out here so the decoder is not checked against itself.
  const exp: number[] = [];
  const log: number[] = Array.from({ length: 256 }, () => 0);
  let value = 1;
  for (let i = 0; i < 255; i++) {
    exp.push(value);
    log[value] = i;
    value <<= 1;

    const hasOverflowed = value >= 256;
    if (hasOverflowed) {
      value ^= 0x11d;
    }
  }
  function mul({ left, right }: {
    readonly left: number;
    readonly right: number;
  }) {
    const isZero = left === 0 || right === 0;
    return isZero ? 0 : exp[((log[left] ?? 0) + (log[right] ?? 0)) % 255] ?? 0;
  }
  let generator = [1];
  for (let power = 0; power < parityCount; power++) {
    const next = Array.from({ length: generator.length + 1 }, () => 0);
    for (const [i, coefficient] of generator.entries()) {
      next[i + 1] = (next[i + 1] ?? 0) ^ coefficient;
      next[i] = (next[i] ?? 0) ^ mul({
        left: coefficient,
        right: exp[power] ?? 0
      });
    }
    generator = next;
  }
  const remainder = Array.from({ length: parityCount }, () => 0);
  for (const byte of data) {
    const factor = byte ^ (remainder.shift() ?? 0);
    remainder.push(0);
    for (let i = 0; i < parityCount; i++) {
      remainder[i] = (remainder[i] ?? 0) ^ mul({
        left: generator[parityCount - 1 - i] ?? 0,
        right: factor
      });
    }
  }
  return Uint8Array.from([...data, ...remainder]);
}

test("symbols made by another encoder decode: every version, level and mask in the fixtures", () => {
  for (const fixture of QR_FIXTURES) {
    const grid = gridFromRows(fixture.rows);
    assert.equal(decodeQrMatrix(grid), fixture.text, fixture.name);
  }
});

test("a mirrored symbol decodes once transposed", () => {
  for (const fixture of QR_FIXTURES.slice(0, 4)) {
    const grid = gridFromRows(fixture.rows).transposed();
    assert.equal(decodeQrMatrix(grid), undefined, `${fixture.name} transposed is not itself`);
    assert.equal(decodeQrMatrix(grid.transposed()), fixture.text);
  }
});

test("the format information is read with up to three bit errors", () => {
  const fixture = QR_FIXTURES[2];
  assert.ok(fixture);
  const grid = gridFromRows(fixture.rows);
  const intact = readFormat(grid);
  assert.deepEqual(intact, {
    level: ErrorCorrectionLevel.QUARTILE,
    mask: 3
  });
  const damaged = new BitMatrix({
    width: grid.width,
    height: grid.height
  });
  damaged.bits.set(grid.bits);
  for (const x of [0, 1, 2]) {
    damaged.bits[8 * grid.width + x] = damaged.bits[8 * grid.width + x] === 1 ? 0 : 1;
  }
  assert.deepEqual(readFormat(damaged), intact);
});

test("this library's encoder makes the same symbol as the Python one for the same input", () => {
  const comparable = QR_FIXTURES.filter(fixture => fixture.mask !== undefined && !/mixed|UTF/u.test(fixture.name));
  assert.ok(comparable.length >= 8);
  for (const fixture of comparable) {
    const level = LEVEL_NAMES.indexOf(fixture.level);
    const { grid } = encodeQr({
      text: fixture.text,
      version: fixture.version,
      level,
      mask: fixture.mask ?? 0
    });
    assert.deepEqual(grid.bits, gridFromRows(fixture.rows).bits, fixture.name);
  }
});

test("every version at every level round-trips through the encoder and decoder", () => {
  for (const level of LEVELS) {
    for (const version of VERSIONS) {
      const capacity = numbersOf(DATA_CODEWORDS[level])[version - 1] ?? 0;
      const text = Array.from({ length: Math.max(1, Math.floor(capacity * 0.8) - 4) }, (_, i) => String.fromCharCode(97 + (i * 7) % 26)).join("");
      const { grid } = encodeQr({
        text,
        version,
        level,
        mask: (version + level) % 8
      });
      assert.equal(decodeQrMatrix(grid), text, `version ${version} level ${LEVEL_NAMES[level]}`);
    }
  }
});

test("text modes: numeric, alphanumeric, bytes and UTF-8 round-trip", () => {
  const samples = ["0123456789012", "HELLO WORLD $%*+-./:", "mixed Case, punctuation!", "שלום עולם ✓ 日本語", ""];
  for (const text of samples) {
    const { grid } = encodeQr({
      text,
      level: ErrorCorrectionLevel.MEDIUM
    });
    assert.equal(decodeQrMatrix(grid), text, JSON.stringify(text));
  }
});
