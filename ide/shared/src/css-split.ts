const OPEN = "(";
const CLOSE = ")";

/**
 * The parts of a CSS value between a separator character, leaving alone every separator inside parentheses
 * (`rgba(0, 0, 0)` is one part when splitting on commas or spaces).
 */
export function splitTopLevel({ text, separator }: {
  text: string;
  separator: string;
}) {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text.split("")) {
    depth += Number(char === OPEN) - Number(char === CLOSE);
    const isSeparator = depth === 0 && (separator === " " ? /\s/u.test(char) : char === separator);
    if (isSeparator) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  parts.push(current);
  return separator === " " ? parts.filter(part => part !== "") : parts.map(part => part.trim());
}

/**
 * The index just after the parenthesis that closes the one at `open`, or -1 when it never closes.
 */
export function closingIndex({ text, open }: {
  text: string;
  open: number;
}) {
  let depth = 0;
  for (const [i, char] of text.split("").entries()) {
    const isBefore = i < open;
    if (isBefore) {
      continue;
    }

    depth += Number(char === OPEN) - Number(char === CLOSE);
    const isClosed = depth === 0;
    if (isClosed) {
      return i + 1;
    }
  }

  return -1;
}

/**
 * The pixels a native length is: `12px` and `12` are 12, and a bare `0` is 0; undefined for every other unit,
 * since WinUI's units are pixels only.
 */
export function pixelsOf(word: string) {
  const match = /^(-?\d*\.?\d+)(px)?$/iu.exec(word.trim());
  const isLength = match !== null;
  return isLength ? Number(match[1]) : undefined;
}
