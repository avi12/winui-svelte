import { extentOf } from "./extent.ts";
import { matchPattern } from "./pattern-match.ts";
import type { Run } from "#src/barcode/runs.js";
import { sumOf } from "#src/barcode/sum-of.js";

// GS1 General Specifications, section 5.2: EAN-13, EAN-8 and UPC-A.
// The widths of the four elements of each digit, in the L code (a left digit
// with odd parity, and, read from a bar, a right digit); the G code is the
// same widths reversed.
const L_PATTERNS = ["3211", "2221", "2122", "1411", "1132", "1231", "1114", "1312", "1213", "3112"];
const G_PATTERNS = L_PATTERNS.map(pattern => Array.from(pattern).reverse().join(""));
const LEFT_PATTERNS = [...L_PATTERNS, ...G_PATTERNS];
// Which of the six left digits are G-coded, by the thirteenth digit.
const PARITY_PATTERNS = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
const GUARD_RUNS = 3;
const CENTER_RUNS = 5;
const DIGIT_RUNS = 4;
const EAN_13_MODULES = 95;
const EAN_8_MODULES = 67;
const DIGITS_PER_HALF_13 = 6;
const DIGITS_PER_HALF_8 = 4;
const DIGIT_COUNT = 10;
const ODD_WEIGHT = 3;
const GUARD_TOLERANCE = 0.65;
const GUARD_SLACK = 0.5;

function isCheckDigitValid(digits: string) {
  const values = Array.from(digits, Number);
  const checkDigit = values.pop() ?? 0;
  let sum = 0;
  for (const [i, value] of values.reverse().entries()) {
    sum += value * (i % 2 === 0 ? ODD_WEIGHT : 1);
  }
  return (DIGIT_COUNT - sum % DIGIT_COUNT) % DIGIT_COUNT === checkDigit;
}

function widthsOf({ runs, start, count }: {
  readonly runs: readonly Run[];
  readonly start: number;
  readonly count: number;
}) {
  return runs.slice(start, start + count).map(run => run.width);
}

function isGuard(widths: readonly number[]) {
  const mean = sumOf(widths) / widths.length;
  return widths.every(width => Math.abs(width - mean) <= mean * GUARD_TOLERANCE + GUARD_SLACK);
}

function decodeSymbol({ runs, start, halfDigits }: {
  readonly runs: readonly Run[];
  readonly start: number;
  readonly halfDigits: number;
}) {
  const guardStart = widthsOf({
    runs,
    start,
    count: GUARD_RUNS
  });
  const centerStart = start + GUARD_RUNS + halfDigits * DIGIT_RUNS;
  const centerGuard = widthsOf({
    runs,
    start: centerStart,
    count: CENTER_RUNS
  });
  const rightStart = centerStart + CENTER_RUNS;
  const endStart = rightStart + halfDigits * DIGIT_RUNS;
  const guardEnd = widthsOf({
    runs,
    start: endStart,
    count: GUARD_RUNS
  });
  const hasGuards = [guardStart, centerGuard, guardEnd].every(isGuard);
  if (!hasGuards) {
    return undefined;
  }

  const leftIndexes: number[] = [];
  const rightIndexes: number[] = [];
  for (let i = 0; i < halfDigits; i++) {
    const left = matchPattern({
      widths: widthsOf({
        runs,
        start: start + GUARD_RUNS + i * DIGIT_RUNS,
        count: DIGIT_RUNS
      }),
      patterns: LEFT_PATTERNS
    });
    const right = matchPattern({
      widths: widthsOf({
        runs,
        start: rightStart + i * DIGIT_RUNS,
        count: DIGIT_RUNS
      }),
      patterns: L_PATTERNS
    });
    const isMatched = left >= 0 && right >= 0;
    if (!isMatched) {
      return undefined;
    }

    leftIndexes.push(left);
    rightIndexes.push(right);
  }
  return {
    leftIndexes,
    rightIndexes
  };
}

function ean13Digits({ leftIndexes, rightIndexes }: {
  readonly leftIndexes: readonly number[];
  readonly rightIndexes: readonly number[];
}) {
  const parity = leftIndexes.map(index => index >= DIGIT_COUNT ? "G" : "L").join("");
  const first = PARITY_PATTERNS.indexOf(parity);
  const isKnownParity = first >= 0;
  if (!isKnownParity) {
    return undefined;
  }

  const digits = String(first) + [...leftIndexes.map(index => index % DIGIT_COUNT), ...rightIndexes].join("");
  return isCheckDigitValid(digits) ? digits : undefined;
}

function ean8Digits({ leftIndexes, rightIndexes }: {
  readonly leftIndexes: readonly number[];
  readonly rightIndexes: readonly number[];
}) {
  const isAllOdd = leftIndexes.every(index => index < DIGIT_COUNT);
  if (!isAllOdd) {
    return undefined;
  }

  const digits = [...leftIndexes, ...rightIndexes].join("");
  return isCheckDigitValid(digits) ? digits : undefined;
}

/**
 * Reads an EAN-13, UPC-A (as EAN-13 with a leading zero) or EAN-8 symbol that
 * starts at the black run `start`, or returns `undefined`.
 */
export function decodeEan({ runs, start }: {
  readonly runs: readonly Run[];
  readonly start: number;
}) {
  const hasStartGuard = isGuard(
    widthsOf({
      runs,
      start,
      count: GUARD_RUNS
    })
  );
  if (!hasStartGuard) {
    return undefined;
  }

  const candidates = [
    {
      halfDigits: DIGITS_PER_HALF_13,
      moduleCount: EAN_13_MODULES,
      toDigits: ean13Digits
    },
    {
      halfDigits: DIGITS_PER_HALF_8,
      moduleCount: EAN_8_MODULES,
      toDigits: ean8Digits
    }
  ];
  for (const { halfDigits, moduleCount, toDigits } of candidates) {
    const runCount = GUARD_RUNS * 2 + CENTER_RUNS + halfDigits * DIGIT_RUNS * 2;
    const last = runs[start + runCount - 1];
    const first = runs[start];
    const isComplete = first !== undefined && last !== undefined;
    if (!isComplete) {
      continue;
    }

    const decoded = decodeSymbol({
      runs,
      start,
      halfDigits
    });
    const digits = decoded ? toDigits(decoded) : undefined;
    if (digits) {
      return {
        digits,
        runCount,
        moduleCount,
        ...extentOf({
          first,
          last
        })
      };
    }
  }
  return undefined;
}
