import { extentOf } from "./extent.ts";
import { matchPattern } from "./pattern-match.ts";
import type { Run } from "#src/barcode/runs.js";

// ISO/IEC 15417: the widths of the six elements of each of the 106 symbol
// characters (values 0 to 102, then the three start characters), and the
// seven of the stop character.
export const CODE_128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131",
  "211412", "211214", "211232"
];
export const CODE_128_STOP_PATTERN = "2331112";

const FIRST_START_VALUE = 103;
const START_CODE_A = 103;
const START_CODE_C = 105;
const SYMBOL_RUNS = 6;
const SYMBOL_MODULES = 11;
const STOP_MODULES = 13;
const STOP_RUNS = 7;
const CHECK_MODULO = 103;
const MINIMUM_SYMBOLS = 3;
const MAXIMUM_SYMBOLS = 80;
const SHIFT = 98;
const FNC_1 = 102;
const SPACE_CODE = 32;
const LAST_DIGIT_PAIR = 99;
const SUBSET_A_CONTROL_START = 64;
const SUBSET_A_LAST = 95;
const GROUP_SEPARATOR = "\u001d";

const Subset = {
  A: "a",
  B: "b",
  C: "c"
} as const;
type Subset = typeof Subset[keyof typeof Subset];

// The values 100 and 101 mean FNC4 or a switch to another subset.
const SWITCH_VALUES: Readonly<Record<Subset, Readonly<Record<string, Subset | undefined>>>> = {
  [Subset.A]: {
    99: Subset.C,
    100: Subset.B
  },
  [Subset.B]: {
    99: Subset.C,
    101: Subset.A
  },
  [Subset.C]: {
    100: Subset.B,
    101: Subset.A
  }
};

const START_SUBSETS: Readonly<Record<number, Subset | undefined>> = {
  [START_CODE_A]: Subset.A,
  [START_CODE_C]: Subset.C
};

function characterOf({ value, subset }: {
  readonly value: number;
  readonly subset: Subset;
}) {
  const isSubsetC = subset === Subset.C;
  if (isSubsetC) {
    return value <= LAST_DIGIT_PAIR ? String(value).padStart(2, "0") : "";
  }

  const isFunction = value > SUBSET_A_LAST;
  if (isFunction) {
    return "";
  }

  const isControl = subset === Subset.A && value >= SUBSET_A_CONTROL_START && value <= SUBSET_A_LAST;
  return String.fromCharCode(isControl ? value - SUBSET_A_CONTROL_START : value + SPACE_CODE);
}

function textOf(values: readonly number[]) {
  const [startValue = 0, ...symbols] = values;
  let subset = START_SUBSETS[startValue] ?? Subset.B;
  let shifted: Subset | undefined;
  let text = "";
  for (const [i, value] of symbols.entries()) {
    const isFunctionOne = value === FNC_1;
    const isShift = value === SHIFT && subset !== Subset.C;
    const switched = SWITCH_VALUES[subset][String(value)];
    if (isFunctionOne) {
      text += i === 0 ? "" : GROUP_SEPARATOR;
    } else if (isShift) {
      shifted = subset === Subset.A ? Subset.B : Subset.A;
    } else if (switched) {
      subset = switched;
    } else {
      text += characterOf({
        value,
        subset: shifted ?? subset
      });
      shifted = undefined;
    }
  }
  return text;
}

function isChecksumValid(values: readonly number[]) {
  const checksum = values[values.length - 1] ?? -1;
  let sum = values[0] ?? 0;
  for (let i = 1; i < values.length - 1; i++) {
    sum += i * (values[i] ?? 0);
  }
  return sum % CHECK_MODULO === checksum;
}

/**
 * Reads a Code 128 symbol that starts at the black run `start`, or returns
 * `undefined`. The text is what the symbol encodes; FNC1 at the start (GS1-128)
 * is dropped and FNC1 elsewhere becomes the group separator.
 */
export function decodeCode128({ runs, start }: {
  readonly runs: readonly Run[];
  readonly start: number;
}) {
  const first = runs[start];
  const startValue = matchPattern({
    widths: runs.slice(start, start + SYMBOL_RUNS).map(run => run.width),
    patterns: CODE_128_PATTERNS.slice(FIRST_START_VALUE, START_CODE_C + 1)
  }) + FIRST_START_VALUE;
  const isStart = first !== undefined && startValue >= FIRST_START_VALUE;
  if (!isStart) {
    return undefined;
  }

  const values = [startValue];
  const dataPatterns = CODE_128_PATTERNS.slice(0, FIRST_START_VALUE);
  for (let position = start + SYMBOL_RUNS; values.length < MAXIMUM_SYMBOLS; position += SYMBOL_RUNS) {
    const stopRuns = runs.slice(position, position + STOP_RUNS);
    const isStop = stopRuns.length === STOP_RUNS
      && matchPattern({
        widths: stopRuns.map(run => run.width),
        patterns: [CODE_128_STOP_PATTERN]
      }) === 0;
    const hasSymbols = values.length >= MINIMUM_SYMBOLS;
    const last = stopRuns[STOP_RUNS - 1];
    const isEnd = isStop && hasSymbols && last;
    if (isEnd) {
      const isValid = isChecksumValid(values);
      const runCount = position + STOP_RUNS - start;
      const moduleCount = values.length * SYMBOL_MODULES + STOP_MODULES;
      return isValid ? {
        text: textOf(values.slice(0, -1)),
        runCount,
        moduleCount,
        ...extentOf({
          first,
          last
        })
      } : undefined;
    }

    const value = matchPattern({
      widths: runs.slice(position, position + SYMBOL_RUNS).map(run => run.width),
      patterns: dataPatterns
    });
    const isSymbol = value >= 0 && runs.length >= position + SYMBOL_RUNS;
    if (!isSymbol) {
      return undefined;
    }

    values.push(value);
  }
  return undefined;
}
