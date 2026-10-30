// A CSS font shorthand (`italic bold 16px/1.2 "Segoe UI", sans-serif`) read
// into what a Win2D text format takes.

const POINTS_PER_INCH = 72;
const PIXELS_PER_INCH = 96;
const PIXELS_PER_POINT = PIXELS_PER_INCH / POINTS_PER_INCH;
const PIXELS_PER_EM = 16;
const PERCENT = 100;
// CSS's keyword sizes, as multiples of the medium size.
const XX_SMALL = 0.5625;
const X_SMALL = 0.625;
const SMALL = 0.8125;
const LARGE = 1.125;
const X_LARGE = 1.5;
const XX_LARGE = 2;
const NORMAL_WEIGHT = 400;
const BOLD_WEIGHT = 700;
const LIGHTER_WEIGHT = 300;
const MAX_WEIGHT = 1000;
const SIZE_PATTERN = /^(\d*\.?\d+)(px|pt|em|rem|%)(?:\/\S+)?$/iu;
const QUOTES = /^["']|["']$/gu;

/** How slanted a font is. */
export const FontSlant = {
  NORMAL: "normal",
  ITALIC: "italic",
  OBLIQUE: "oblique"
} as const;
/** How slanted a font is: `normal`, `italic` or `oblique`. */
export type FontSlant = typeof FontSlant[keyof typeof FontSlant];

/** What a font shorthand says: the size is in pixels. */
export interface ParsedFont {
  slant: FontSlant;
  weight: number;
  size: number;
  family: string;
}

const UNIT_PIXELS = new Map<string, number>([
  ["px", 1],
  ["pt", PIXELS_PER_POINT],
  ["em", PIXELS_PER_EM],
  ["rem", PIXELS_PER_EM],
  ["%", PIXELS_PER_EM / PERCENT]
]);
const KEYWORD_WEIGHTS = new Map<string, number>([
  ["normal", NORMAL_WEIGHT],
  ["bold", BOLD_WEIGHT],
  ["bolder", BOLD_WEIGHT],
  ["lighter", LIGHTER_WEIGHT]
]);
const KEYWORD_SIZES = new Map<string, number>([
  ["xx-small", PIXELS_PER_EM * XX_SMALL],
  ["x-small", PIXELS_PER_EM * X_SMALL],
  ["small", PIXELS_PER_EM * SMALL],
  ["medium", PIXELS_PER_EM],
  ["large", PIXELS_PER_EM * LARGE],
  ["x-large", PIXELS_PER_EM * X_LARGE],
  ["xx-large", PIXELS_PER_EM * XX_LARGE]
]);
const GENERIC_FAMILIES = new Map<string, string>([
  ["sans-serif", "Segoe UI"],
  ["system-ui", "Segoe UI"],
  ["ui-sans-serif", "Segoe UI"],
  ["serif", "Times New Roman"],
  ["ui-serif", "Times New Roman"],
  ["monospace", "Consolas"],
  ["ui-monospace", "Consolas"],
  ["cursive", "Segoe Script"],
  ["fantasy", "Impact"]
]);
const IGNORED_KEYWORDS = new Set(["small-caps", "ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded"]);

function sizeOf(word: string) {
  const keyword = KEYWORD_SIZES.get(word);
  const isKeyword = keyword !== undefined;
  if (isKeyword) {
    return keyword;
  }

  const match = SIZE_PATTERN.exec(word);
  const amount = Number(match?.[1]);
  const factor = UNIT_PIXELS.get((match?.[2] ?? "").toLowerCase());
  const isSize = match !== null && factor !== undefined;
  return isSize ? amount * factor : undefined;
}

function familyOf(text: string) {
  const first = text.split(",")[0]?.trim().replaceAll(QUOTES, "") ?? "";
  return GENERIC_FAMILIES.get(first.toLowerCase()) ?? first;
}

// What a word before the size says about the font: its slant or weight, or nothing (a
// variant or stretch word); undefined when it is none of those.
function leadingWord({ word, slant, weight }: {
  word: string;
  slant: FontSlant;
  weight: number;
}) {
  const numeric = Number(word);
  const isNumeric = Number.isInteger(numeric) && numeric >= 1 && numeric <= MAX_WEIGHT;
  const keywordWeight = KEYWORD_WEIGHTS.get(word);
  const isSlant = word === FontSlant.ITALIC || word === FontSlant.OBLIQUE;
  const isIgnorable = word === FontSlant.NORMAL || IGNORED_KEYWORDS.has(word);
  if (isSlant) {
    return {
      slant: word === FontSlant.ITALIC ? FontSlant.ITALIC : FontSlant.OBLIQUE,
      weight
    };
  }

  const isWeight = isNumeric || keywordWeight !== undefined;
  if (isWeight) {
    return {
      slant,
      weight: keywordWeight ?? numeric
    };
  }

  return isIgnorable ? {
    slant,
    weight
  } : undefined;
}

/**
 * Reads a CSS font shorthand: optional style, weight and ignored variant words
 * first, then a size (with an optional line height) and the families. Undefined
 * when there is no size or no family, as the platform rejects such a value.
 */
export function parseFont(text: string) {
  const words = text.trim().split(/\s+/u);
  let slant: FontSlant = FontSlant.NORMAL;
  let weight = NORMAL_WEIGHT;
  for (const [iWord, word] of words.entries()) {
    const lower = word.toLowerCase();
    const size = sizeOf(lower);
    const isSize = size !== undefined;
    if (isSize) {
      const family = familyOf(words.slice(iWord + 1).join(" "));
      const hasFamily = family !== "";
      return hasFamily ? {
        slant,
        weight,
        size,
        family
      } satisfies ParsedFont : undefined;
    }

    const next = leadingWord({
      word: lower,
      slant,
      weight
    });
    const isUnknown = next === undefined;
    if (isUnknown) {
      return undefined;
    }

    ({ slant, weight } = next);
  }

  return undefined;
}
