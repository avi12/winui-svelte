import { parseLength, parseNumber, splitWords } from "#src/css/parse/values.js";
import type { Declaration } from "#src/css/translate/types.js";

/** A flex item's `flex-basis`: its content size, or a length in px. */
export type FlexBasis =
  | {
    kind: "auto";
  }
  | {
    kind: "length";
    pixels: number;
  };

/** A flex item's share of the free space, as the cascade of its `flex` properties leaves it. */
export interface FlexItem {
  grow: number;
  shrink: number;
  basis: FlexBasis;
}

/** The properties that make a flex item's size. */
export const FLEX_MEMBERS: readonly string[] = ["flex", "flex-grow", "flex-shrink", "flex-basis"];

const AUTO_BASIS: FlexBasis = { kind: "auto" };
const AUTO_WORDS: ReadonlySet<string> = new Set(["auto", "content"]);
const NO_BASIS = 0;
const FLEX_NONE = {
  grow: 0,
  shrink: 0,
  basis: AUTO_BASIS
} satisfies FlexItem;
const FLEX_AUTO = {
  grow: 1,
  shrink: 1,
  basis: AUTO_BASIS
} satisfies FlexItem;
const FLEX_INITIAL = {
  grow: 0,
  shrink: 1,
  basis: AUTO_BASIS
} satisfies FlexItem;
const SHORTHAND_KEYWORDS = new Map<string, FlexItem>([
  ["none", FLEX_NONE],
  ["auto", FLEX_AUTO],
  ["initial", FLEX_INITIAL]
]);
const MAX_SHORTHAND_WORDS = 3;

/** An item with no flex declaration: it does not grow, it would shrink, and it is as big as its content. */
export const DEFAULT_FLEX: FlexItem = FLEX_INITIAL;

/** A flex-basis, or null for a word that is none (a percentage other than 0%, a keyword WinUI has no meaning for). */
function parseBasis(word: string) {
  const lower = word.toLowerCase();
  if (AUTO_WORDS.has(lower)) {
    return AUTO_BASIS;
  }

  const isZeroPercent = lower === "0%";
  const pixels = isZeroPercent ? NO_BASIS : parseLength(word);
  return pixels === null ? null : {
    kind: "length",
    pixels
  } satisfies FlexBasis;
}

function parseFactor(word: string) {
  const factor = parseNumber(word);
  const isFactor = factor !== null && factor >= 0;
  return isFactor ? factor : null;
}

// `flex: 1`, `flex: 1 1 0`, `flex: 2 120px`, `flex: 120px`, and the keywords.
function parseShorthand(value: string) {
  const keyword = SHORTHAND_KEYWORDS.get(value.trim().toLowerCase());
  const isKeyword = keyword !== undefined;
  if (isKeyword) {
    return keyword;
  }

  const words = splitWords(value);
  const [first = "", second, third] = words;
  const isTooLong = words.length > MAX_SHORTHAND_WORDS;
  const grow = parseFactor(first);
  if (isTooLong) {
    return null;
  }

  const isBasisOnly = grow === null && words.length === 1;
  if (isBasisOnly) {
    const basis = parseBasis(first);
    return basis === null ? null : {
      grow: 1,
      shrink: 1,
      basis
    } satisfies FlexItem;
  }

  const isGrowMissing = grow === null;
  if (isGrowMissing) {
    return null;
  }

  const hasShrink = second !== undefined && parseFactor(second) !== null;
  const shrink = hasShrink ? parseFactor(second) : 1;
  const basisWord = hasShrink ? third : second;
  const basis = basisWord === undefined ? {
    kind: "length",
    pixels: NO_BASIS
  } satisfies FlexBasis : parseBasis(basisWord);
  const isUnreadable = shrink === null || basis === null;
  return isUnreadable ? null : {
    grow,
    shrink,
    basis
  } satisfies FlexItem;
}

/** What one declaration of the `flex` family makes of the item so far; null for a value WinUI cannot lay out. */
export function applyFlex({ item, declaration }: {
  item: FlexItem;
  declaration: Declaration;
}) {
  const { property, value } = declaration;
  const isShorthand = property === "flex";
  if (isShorthand) {
    return parseShorthand(value);
  }

  const isGrow = property === "flex-grow";
  if (isGrow) {
    const grow = parseFactor(value.trim());
    return grow === null ? null : {
      ...item,
      grow
    };
  }

  const isShrink = property === "flex-shrink";
  if (isShrink) {
    const shrink = parseFactor(value.trim());
    return shrink === null ? null : {
      ...item,
      shrink
    };
  }

  const basis = parseBasis(value.trim());
  return basis === null ? null : {
    ...item,
    basis
  };
}
