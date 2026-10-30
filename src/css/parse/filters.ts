import { parseDegrees } from "./angles.ts";
import { parseColor } from "./colors.ts";
import { splitWords } from "./split.ts";
import { parseLength, parseNumber, parsePercent } from "./values.ts";

// The CSS filter functions, in the terms of an effect graph: every colour
// function (grayscale, sepia, saturate, hue-rotate, invert, opacity,
// brightness, contrast) is the 4 by 5 matrix the Filter Effects spec defines,
// so a run of them is one matrix, blur() is a Gaussian blur and drop-shadow()
// a shadow under the content. The build reads them; the window applies them.

/** A 4 by 5 colour matrix, row by row: the rows give red, green, blue and alpha, the fifth column adds. */
export type ColorMatrix = readonly number[];

/** One step of a filter list. */
export type FilterStep =
  | {
    readonly kind: "blur";
    /** The standard deviation, in pixels. */
    readonly radius: number;
  }
  | {
    readonly kind: "matrix";
    readonly values: ColorMatrix;
  }
  | {
    readonly kind: "shadow";
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    /** XAML `#AARRGGBB` */
    readonly color: string;
  };

/** What reading a filter list gives: its steps, or why it is not one. */
export type FilterResult =
  | {
    readonly isValid: true;
    readonly steps: readonly FilterStep[];
  }
  | {
    readonly isValid: false;
    readonly reason: string;
  };

const FILTER_FUNCTION = /^([a-z-]+)\((.*)\)$/isu;
const MATRIX_ROWS = 4;
const MATRIX_COLUMNS = 5;
const ALPHA_ROW = 3;
const OFFSET_COLUMN = 4;
const CHANNELS = 3;
const DEFAULT_SHADOW_COLOR = "#80000000";
const MIN_SHADOW_LENGTHS = 2;
const MAX_SHADOW_LENGTHS = 3;
const HALF = 0.5;
const HALF_TURN_DEGREES = 180;

// The coefficients of the Filter Effects spec, as the numbers they are.
function numbers(text: string) {
  return text.split(" ").map(Number);
}

const LUMA = numbers("0.2126 0.7152 0.0722");
const SATURATE_LUMA = numbers("0.213 0.715 0.072");
const SEPIA = numbers("0.393 0.769 0.189 0.349 0.686 0.168 0.272 0.534 0.131");
const HUE_ROTATE_SINE = numbers("-0.213 -0.715 0.928 0.143 0.14 -0.283 -0.787 0.715 0.072");

/** The matrix that changes nothing. */
export const IDENTITY_MATRIX: ColorMatrix = Array.from({ length: MATRIX_ROWS * MATRIX_COLUMNS }, (_unused, i) => {
  const isDiagonal = i % (MATRIX_COLUMNS + 1) === 0;
  return isDiagonal ? 1 : 0;
});

function at({ values, row, column }: {
  values: ColorMatrix;
  row: number;
  column: number;
}) {
  return values[row * MATRIX_COLUMNS + column] ?? 0;
}

/**
 * The matrix of `first` and then `second`: what a pixel goes through when the
 * two colour functions are written in that order.
 */
export function multiplyMatrices({ first, second }: {
  first: ColorMatrix;
  second: ColorMatrix;
}) {
  return Array.from({ length: MATRIX_ROWS * MATRIX_COLUMNS }, (_unused, i) => {
    const row = Math.floor(i / MATRIX_COLUMNS);
    const column = i % MATRIX_COLUMNS;
    const isOffsetColumn = column === OFFSET_COLUMN;
    let sum = isOffsetColumn ? at({
      values: second,
      row,
      column: OFFSET_COLUMN
    }) : 0;
    for (let iChannel = 0; iChannel < MATRIX_ROWS; iChannel++) {
      sum += at({
        values: second,
        row,
        column: iChannel
      }) * at({
        values: first,
        row: iChannel,
        column
      });
    }

    return sum;
  });
}

// A matrix whose colour rows (red, green and blue; each three numbers) are given and alpha is kept.
function fromColorRows(rows: readonly number[]) {
  return Array.from({ length: MATRIX_ROWS * MATRIX_COLUMNS }, (_unused, i) => {
    const row = Math.floor(i / MATRIX_COLUMNS);
    const column = i % MATRIX_COLUMNS;
    const isColor = row < CHANNELS && column < CHANNELS;
    if (isColor) {
      return rows[row * CHANNELS + column] ?? 0;
    }

    const isAlpha = row === ALPHA_ROW && column === ALPHA_ROW;
    return isAlpha ? 1 : 0;
  });
}

function repeatRow(row: readonly number[]) {
  return Array.from({ length: CHANNELS }, () => row).flat();
}

function identityRows() {
  return Array.from({ length: CHANNELS * CHANNELS }, (_unused, i) => {
    const isDiagonal = i % (CHANNELS + 1) === 0;
    return isDiagonal ? 1 : 0;
  });
}

// `amount` of the way from the identity to `target` (the colour rows of a matrix).
function mixWithIdentity({ target, amount }: {
  target: readonly number[];
  amount: number;
}) {
  const identity = identityRows();
  return fromColorRows(identity.map((own, i) => own * (1 - amount) + (target[i] ?? 0) * amount));
}

/** `grayscale(amount)`, amount from 0 to 1. */
export function grayscaleMatrix(amount: number) {
  return mixWithIdentity({
    target: repeatRow(LUMA),
    amount
  });
}

/** `sepia(amount)`, amount from 0 to 1. */
export function sepiaMatrix(amount: number) {
  return mixWithIdentity({
    target: SEPIA,
    amount
  });
}

/** `saturate(amount)`: 1 changes nothing, 0 is gray, above 1 oversaturates. */
export function saturateMatrix(amount: number) {
  const gray = repeatRow(SATURATE_LUMA);
  const identity = identityRows();
  return fromColorRows(identity.map((own, i) => own * amount + (gray[i] ?? 0) * (1 - amount)));
}

/** `hue-rotate(angle)`, the angle in degrees. */
export function hueRotateMatrix(degrees: number) {
  const radians = degrees * Math.PI / HALF_TURN_DEGREES;
  const [cosine, sine] = [Math.cos(radians), Math.sin(radians)];
  const gray = repeatRow(SATURATE_LUMA);
  const identity = identityRows();
  return fromColorRows(
    identity.map((own, i) => {
      const grayPart = gray[i] ?? 0;
      return grayPart + cosine * (own - grayPart) + sine * (HUE_ROTATE_SINE[i] ?? 0);
    })
  );
}

function diagonalMatrix({ scale, offset }: {
  scale: number;
  offset: number;
}) {
  return Array.from({ length: MATRIX_ROWS * MATRIX_COLUMNS }, (_unused, i) => {
    const row = Math.floor(i / MATRIX_COLUMNS);
    const column = i % MATRIX_COLUMNS;
    const isOffset = column === OFFSET_COLUMN;
    if (isOffset) {
      return row < CHANNELS ? offset : 0;
    }

    const isOffDiagonal = row !== column;
    if (isOffDiagonal) {
      return 0;
    }

    return row < CHANNELS ? scale : 1;
  });
}

/** `invert(amount)`, amount from 0 to 1. */
export function invertMatrix(amount: number) {
  return diagonalMatrix({
    scale: 1 - 2 * amount,
    offset: amount
  });
}

/** `brightness(amount)`: a factor on the colour channels. */
export function brightnessMatrix(amount: number) {
  return diagonalMatrix({
    scale: amount,
    offset: 0
  });
}

/** `contrast(amount)`: a factor around middle gray. */
export function contrastMatrix(amount: number) {
  return diagonalMatrix({
    scale: amount,
    offset: HALF - HALF * amount
  });
}

/** `opacity(amount)`, amount from 0 to 1: a factor on alpha. */
export function opacityMatrix(amount: number) {
  return Array.from({ length: MATRIX_ROWS * MATRIX_COLUMNS }, (_unused, i) => {
    const row = Math.floor(i / MATRIX_COLUMNS);
    const column = i % MATRIX_COLUMNS;
    const isOffDiagonal = row !== column;
    if (isOffDiagonal) {
      return 0;
    }

    return row === ALPHA_ROW ? amount : 1;
  });
}

// A number or percentage argument as a number (50% is 0.5); an empty argument is `fallback`.
function amountOf({ text, fallback }: {
  text: string;
  fallback: number;
}) {
  const word = text.trim();
  const isEmpty = word === "";
  if (isEmpty) {
    return fallback;
  }

  const percent = parsePercent(word);
  const amount = percent ?? parseNumber(word);
  const isNegative = amount !== null && amount < 0;
  return isNegative ? null : amount;
}

function clampUnit(amount: number) {
  return Math.min(1, amount);
}

const MATRIX_FUNCTIONS = new Map<string, (amount: number) => ColorMatrix>([
  ["grayscale", amount => grayscaleMatrix(clampUnit(amount))],
  ["sepia", amount => sepiaMatrix(clampUnit(amount))],
  ["saturate", saturateMatrix],
  ["invert", amount => invertMatrix(clampUnit(amount))],
  ["opacity", amount => opacityMatrix(clampUnit(amount))],
  ["brightness", brightnessMatrix],
  ["contrast", contrastMatrix]
]);

function failure(reason: string) {
  return {
    isValid: false,
    reason
  } as const;
}

function dropShadow(argumentsText: string) {
  const words = splitWords(argumentsText);
  const colors = words.filter(word => parseColor(word) !== null);
  const read = words.filter(word => parseColor(word) === null).map(word => parseLength(word));
  const lengths = read.filter(length => length !== null);
  const hasLengthCount = lengths.length >= MIN_SHADOW_LENGTHS && lengths.length <= MAX_SHADOW_LENGTHS;
  const isShadow = hasLengthCount && lengths.length === read.length && colors.length <= 1;
  if (!isShadow) {
    return null;
  }

  const [x = 0, y = 0, radius = 0] = lengths;
  return {
    kind: "shadow",
    x,
    y,
    radius: Math.max(0, radius),
    color: parseColor(colors[0] ?? "") ?? DEFAULT_SHADOW_COLOR
  } as const;
}

function stepOf({ name, argumentsText }: {
  name: string;
  argumentsText: string;
}) {
  const isBlur = name === "blur";
  if (isBlur) {
    const text = argumentsText.trim();
    const radius = text === "" ? 0 : parseLength(text);
    const isRadius = radius !== null && radius >= 0;
    return isRadius ? {
      kind: "blur",
      radius
    } as const : null;
  }

  const isHueRotate = name === "hue-rotate";
  if (isHueRotate) {
    const text = argumentsText.trim();
    const degrees = text === "" ? 0 : parseDegrees(text);
    return degrees === null ? null : {
      kind: "matrix",
      values: hueRotateMatrix(degrees)
    } as const;
  }

  const isDropShadow = name === "drop-shadow";
  if (isDropShadow) {
    return dropShadow(argumentsText);
  }

  const makeMatrix = MATRIX_FUNCTIONS.get(name);
  const isUnknown = makeMatrix === undefined;
  if (isUnknown) {
    return null;
  }

  const amount = amountOf({
    text: argumentsText,
    fallback: 1
  });
  return amount === null ? null : {
    kind: "matrix",
    values: makeMatrix(amount)
  } as const;
}

// Neighbouring colour matrices are one matrix.
function mergeMatrices(steps: readonly FilterStep[]) {
  const merged: FilterStep[] = [];
  for (const step of steps) {
    const last = merged.at(-1);
    const isMergeable = step.kind === "matrix" && last?.kind === "matrix";
    if (isMergeable) {
      merged[merged.length - 1] = {
        kind: "matrix",
        values: multiplyMatrices({
          first: last.values,
          second: step.values
        })
      };
    } else {
      merged.push(step);
    }
  }

  return merged;
}

/**
 * A `filter` or `backdrop-filter` value (`none`, or one or more of `blur()`,
 * `drop-shadow()`, `grayscale()`, `sepia()`, `saturate()`, `hue-rotate()`,
 * `invert()`, `opacity()`, `brightness()` and `contrast()`) as the steps of an
 * effect graph. Neighbouring colour functions come out as one matrix.
 */
export function parseFilterList(text: string) {
  const words = splitWords(text.trim());
  const isNone = words.length === 1 && words[0]?.toLowerCase() === "none";
  if (isNone) {
    return {
      isValid: true,
      steps: []
    } as const;
  }

  const steps: FilterStep[] = [];
  for (const word of words) {
    const match = FILTER_FUNCTION.exec(word);
    const name = (match?.[1] ?? "").toLowerCase();
    const step = match === null ? null : stepOf({
      name,
      argumentsText: match[2] ?? ""
    });
    const isInvalid = step === null;
    if (isInvalid) {
      return failure(`${word} is not a filter function (blur, drop-shadow, grayscale, sepia, saturate, hue-rotate, invert, opacity, brightness or contrast) with a valid argument`);
    }

    steps.push(step);
  }

  const isEmpty = steps.length === 0;
  return isEmpty ? failure("expected none or filter functions") : {
    isValid: true,
    steps: mergeMatrices(steps)
  } as const;
}
