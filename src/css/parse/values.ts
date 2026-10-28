// The values a declaration holds, read one token at a time. Each parser
// returns null when the token is not that kind of value, so a property can
// try the kinds it accepts and name the one it expected.

// WinUI measures in device-independent pixels, which is what CSS's px is. A
// rem is the browser's default root size; WinUI has no root font size.
const PIXELS_PER_REM = 16;
const MILLISECONDS_PER_SECOND = 1000;
const PERCENT_SCALE = 100;

function depthChange(character: string) {
  const isOpeningParenthesis = character === "(";
  if (isOpeningParenthesis) {
    return 1;
  }

  return character === ")" ? -1 : 0;
}

// Splits at `separator` outside parentheses and strings; empty pieces dropped
// when the separator is whitespace.
function splitOutside({ text, isSeparator }: {
  text: string;
  isSeparator(character: string): boolean;
}) {
  const pieces: string[] = [];
  let depth = 0;
  let current = "";
  let quote = "";
  for (const character of text) {
    const isInString = quote !== "";
    if (isInString) {
      current += character;

      const isClosingQuote = character === quote;
      if (isClosingQuote) {
        quote = "";
      }

      continue;
    }

    const isQuote = character === "\"" || character === "'";
    if (isQuote) {
      quote = character;
    }

    depth += depthChange(character);
    const isSplit = depth === 0 && !isQuote && isSeparator(character);
    if (isSplit) {
      pieces.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  pieces.push(current);
  return pieces.map(piece => piece.trim());
}

/** Splits a value at whitespace outside parentheses and strings. */
export function splitWords(text: string) {
  return splitOutside({
    text,
    isSeparator: character => character.trim() === ""
  }).filter(word => word !== "");
}

/** Splits a value at commas outside parentheses and strings. */
export function splitCommas(text: string) {
  return splitOutside({
    text,
    isSeparator: character => character === ","
  });
}

/** Splits a value at slashes outside parentheses and strings. */
export function splitSlash(text: string) {
  return splitOutside({
    text,
    isSeparator: character => character === "/"
  });
}

const lengthPattern = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem)?$/iu;

/** A length in device-independent pixels: `px`, `rem` (1rem is 16px) or a bare 0; null for anything else. */
export function parseLength(token: string) {
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

const degreesPattern = /^(-?\d*\.?\d+)deg$/iu;

/** An angle in degrees, from `deg`; null for anything else. */
export function parseDegrees(token: string) {
  const match = degreesPattern.exec(token);
  const isMatchMissing = match === null;
  return isMatchMissing ? null : Number(match[1]);
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
