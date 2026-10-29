import { enumMap, setter } from "./property-kit.ts";
import type { GroupInput } from "./property-kit.ts";
import type { Reader } from "#src/css/parse/reader.js";
import { parseNumber, splitCommas } from "#src/css/parse/values.js";

/** WinUI's CharacterSpacing counts thousandths of an em. */
const CHARACTER_SPACING_PER_EM = 1000;

/** WinUI's FontWeights, by name and weight. */
export const FONT_WEIGHTS = [
  {
    name: "Thin",
    weight: 100
  },
  {
    name: "ExtraLight",
    weight: 200
  },
  {
    name: "Light",
    weight: 300
  },
  {
    name: "SemiLight",
    weight: 350
  },
  {
    name: "Normal",
    weight: 400
  },
  {
    name: "Medium",
    weight: 500
  },
  {
    name: "SemiBold",
    weight: 600
  },
  {
    name: "Bold",
    weight: 700
  },
  {
    name: "ExtraBold",
    weight: 800
  },
  {
    name: "Black",
    weight: 900
  },
  {
    name: "ExtraBlack",
    weight: 950
  }
] as const;

const FONT_WEIGHT_KEYWORDS = enumMap([
  ["normal", "Normal"],
  ["bold", "Bold"]
]);

const GENERIC_FAMILIES = enumMap([
  ["system-ui", "Segoe UI Variable"],
  ["sans-serif", "Segoe UI"],
  ["serif", "Cambria"],
  ["monospace", "Consolas"],
  ["ui-monospace", "Consolas"]
]);

/** `text-align`. */
export const textAlignments = enumMap([
  ["left", "Left"],
  ["start", "Left"],
  ["center", "Center"],
  ["right", "Right"],
  ["end", "Right"],
  ["justify", "Justify"]
]);

/** `text-wrap`. */
export const wrapKeywords = enumMap([
  ["wrap", "Wrap"],
  ["nowrap", "NoWrap"]
]);

/** `white-space`. */
export const whiteSpaceKeywords = enumMap([
  ["normal", "Wrap"],
  ["nowrap", "NoWrap"]
]);

/** `word-break`: WinUI breaks inside a word only when it is wider than the line. */
export const wordBreaks = enumMap([
  ["normal", "WrapWholeWords"],
  ["keep-all", "WrapWholeWords"],
  ["break-all", "Wrap"],
  ["break-word", "Wrap"]
]);

/** `user-select`, as IsTextSelectionEnabled. */
export const textSelections = enumMap([
  ["auto", "True"],
  ["text", "True"],
  ["all", "True"],
  ["contain", "True"],
  ["none", "False"]
]);

/** `text-overflow`. */
export const textOverflows = enumMap([
  ["ellipsis", "CharacterEllipsis"],
  ["clip", "Clip"]
]);

/** `text-decoration` and `text-decoration-line`. */
export const textDecorations = enumMap([
  ["none", "None"],
  ["underline", "Underline"],
  ["line-through", "Strikethrough"]
]);

/** `font-style`. */
export const fontStyles = enumMap([
  ["normal", "Normal"],
  ["italic", "Italic"],
  ["oblique", "Oblique"]
]);

/** `font-weight`: a keyword, a `var()`, or the named WinUI weight nearest a number. */
export function fontWeight(reader: Reader) {
  const word = reader.single();
  const isWordMissing = word === null;
  if (isWordMissing) {
    return null;
  }

  const fromVariable = reader.variable({
    token: word,
    kind: "FontWeight"
  });
  const hasFromVariable = fromVariable !== undefined;
  if (hasFromVariable) {
    return fromVariable;
  }

  const keyword = FONT_WEIGHT_KEYWORDS.get(word.toLowerCase());
  const hasKeyword = keyword !== undefined;
  if (hasKeyword) {
    return keyword;
  }

  const weight = parseNumber(word);
  const isWeightMissing = weight === null;
  if (isWeightMissing) {
    return reader.expectedToken({
      what: "normal, bold, or a weight from 1 to 1000",
      token: word
    });
  }

  let nearest: (typeof FONT_WEIGHTS)[number] = FONT_WEIGHTS[0];
  for (const candidate of FONT_WEIGHTS) {
    const isCloser = Math.abs(candidate.weight - weight) < Math.abs(nearest.weight - weight);
    if (isCloser) {
      nearest = candidate;
    }
  }

  return nearest.name;
}

/** `font-family`: a `var()`, or the comma list with generic families mapped to Windows fonts. */
export function fontFamily(reader: Reader) {
  const text = reader.declaration.value;
  const fromVariable = reader.variable({
    token: text,
    kind: "FontFamily"
  });
  const hasFromVariable = fromVariable !== undefined;
  if (hasFromVariable) {
    return fromVariable;
  }

  const names = splitCommas(text).map(name => {
    const unquoted = name.replace(/^(["'])(.*)\1$/u, "$2");
    return GENERIC_FAMILIES.get(unquoted.toLowerCase()) ?? unquoted;
  });
  return names.join(", ");
}

/** `line-height`: `normal`, or a length in px (a multiple of the font size has no WinUI meaning). */
export function lineHeight(input: GroupInput) {
  const reader = input.reading("line-height");
  const word = reader.single();
  const isWordMissing = word === null;
  if (isWordMissing) {
    return [];
  }

  const isNormal = word.toLowerCase() === "normal";
  if (isNormal) {
    return [setter({
      property: "LineHeight",
      value: "0"
    })];
  }

  const isUnitless = parseNumber(word) !== null && parseNumber(word) !== 0;
  if (isUnitless) {
    reader.error(`line-height ${word}: a multiple of the font size has no WinUI meaning; write the height in px`);
    return [];
  }

  const value = reader.length(word);
  // LineHeight only fixes the line's height with this strategy.
  return value === null
    ? []
    : [setter({
      property: "LineHeight",
      value
    }), setter({
      property: "LineStackingStrategy",
      value: "BlockLineHeight"
    })];
}

/**
 * `line-clamp` (and `-webkit-line-clamp`): a number of lines, or `none`. It sets
 * MaxLines, and wraps the text and trims with an ellipsis as the clamp implies;
 * `text-wrap` and `text-overflow` win where they are written too.
 */
export function lineClamp(input: GroupInput) {
  const member = input.computed.has("line-clamp") ? "line-clamp" : "-webkit-line-clamp";
  const reader = input.reading(member);
  const word = reader.single();
  const isWordMissing = word === null;
  if (isWordMissing) {
    return [];
  }

  const isNone = word.toLowerCase() === "none";
  if (isNone) {
    return [setter({
      property: "MaxLines",
      value: "0"
    })];
  }

  const lines = parseNumber(word);
  const isCount = lines !== null && Number.isInteger(lines) && lines > 0;
  if (!isCount) {
    reader.expectedToken({
      what: "none or a whole number of lines",
      token: word
    });
    return [];
  }

  return [
    setter({
      property: "TextWrapping",
      value: "Wrap"
    }),
    setter({
      property: "TextTrimming",
      value: "CharacterEllipsis"
    }),
    setter({
      property: "MaxLines",
      value: String(lines)
    })
  ];
}

/** `letter-spacing`: `normal`, or a size in em. */
export function letterSpacing(reader: Reader) {
  const word = reader.single();
  const isWordMissing = word === null;
  if (isWordMissing) {
    return null;
  }

  const isNormal = word.toLowerCase() === "normal" || word === "0";
  if (isNormal) {
    return "0";
  }

  const match = /^(-?\d*\.?\d+)em$/iu.exec(word);
  return match === null
    ? reader.expectedToken({
      what: "normal or a size in em (WinUI spaces by em)",
      token: word
    })
    : String(Number(match[1]) * CHARACTER_SPACING_PER_EM);
}
