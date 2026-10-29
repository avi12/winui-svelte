import { evaluateCalc } from "./calc.ts";

export { matchingParenthesis, splitCommas, splitSlash, splitWords } from "./split.ts";

// The values a declaration holds, read one token at a time. Each parser
// returns null when the token is not that kind of value, so a property can
// try the kinds it accepts and name the one it expected.

// WinUI measures in device-independent pixels, which is what CSS's px is. A
// rem is the browser's default root size; WinUI has no root font size.
const PIXELS_PER_REM = 16;
const MILLISECONDS_PER_SECOND = 1000;
const PERCENT_SCALE = 100;

const lengthPattern = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem)?$/iu;

/**
 * A length in device-independent pixels: `px`, `rem` (1rem is 16px), a bare 0
 * or a `calc()` of them; null for anything else.
 */
export function parseLength(token: string) {
  const folded = evaluateCalc(token);
  const isCalc = folded !== null;
  if (isCalc) {
    return folded;
  }

  const match = lengthPattern.exec(token);
  const isMatchMissing = match === null;
  if (isMatchMissing) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? "").toLowerCase();
  const isBare = unit === "";
  if (isBare) {
    return amount === 0 ? 0 : null;
  }

  return unit === "rem" ? amount * PIXELS_PER_REM : amount;
}

/** A plain number, or null. */
export function parseNumber(token: string) {
  const isNumber = /^-?(?:\d+\.?\d*|\.\d+)$/u.test(token);
  return isNumber ? Number(token) : null;
}

const percentPattern = /^(-?(?:\d+\.?\d*|\.\d+))%$/u;

/** A percentage as a fraction ("50%" is 0.5), or null. */
export function parsePercent(token: string) {
  const match = percentPattern.exec(token);
  return match === null ? null : Number(match[1]) / PERCENT_SCALE;
}

const timePattern = /^(\d+\.?\d*|\.\d+)(ms|s)$/iu;

/** A duration in milliseconds, from `ms` or `s`; null for anything else. */
export function parseMilliseconds(token: string) {
  const match = timePattern.exec(token);
  const isMatchMissing = match === null;
  if (isMatchMissing) {
    return null;
  }

  const amount = Number(match[1]);
  return (match[2] ?? "").toLowerCase() === "s" ? amount * MILLISECONDS_PER_SECOND : amount;
}

/**
 * Reads a `var(--name, fallback)` token into its name (with the leading
 * `--`) and fallback; null when the token is not one.
 */
export function parseVariable(token: string) {
  const match = /^var\(\s*(--[\w-]+)\s*(?:,(.*))?\)$/isu.exec(token);
  const name = match?.[1];
  const isNameMissing = name === undefined;
  if (isNameMissing) {
    return null;
  }

  const fallback = match?.[2]?.trim();
  const isFallbackMissing = fallback === undefined || fallback === "";
  return {
    name,
    fallback: isFallbackMissing ? null : fallback
  };
}
