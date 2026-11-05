import type { Mapping } from "./conversion-table.ts";
import type { PropValue } from "./prop-value.ts";

export type CssValue =
  | {
    kind: "plain";
    text: string;
    label: string | undefined;
  }
  | {
    kind: "conditional";
    condition: string;
    whenTrue: CssValue;
    whenFalse: CssValue;
  };

export const PIXEL_UNIT = "px";
const LENGTH = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/u;
const UNSAFE_TEXT = /["'{}\\;<>]/u;
const PIXELS = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(?:px)?$/u;
const HEX = /^#[0-9a-fA-F]+$/u;
const SHORT_HEX = 3;
const LONG_HEX = 6;
const ALPHA_HEX = 8;
const ALPHA_DIGITS = 2;
const MAX_SIDES = 4;
const LAST_SIDE = 3;
const TRANSPARENT = "transparent";

function colorOf(value: PropValue) {
  const text = value.kind === "text" ? value.text.trim() : undefined;
  const hasNoText = text === undefined;
  if (hasNoText) {
    return undefined;
  }

  const isTransparent = text.toLowerCase() === TRANSPARENT;
  if (isTransparent) {
    return TRANSPARENT;
  }

  const digits = text.length - 1;
  const isShortOrLong = digits === SHORT_HEX || digits === LONG_HEX;
  if (!HEX.test(text)) {
    return undefined;
  }

  if (isShortOrLong) {
    return text;
  }

  return digits === ALPHA_HEX ? `#${text.slice(1 + ALPHA_DIGITS)}${text.slice(1, 1 + ALPHA_DIGITS)}` : undefined;
}

function numberOf(value: PropValue) {
  const literal = value.kind === "number" ? value.literal : undefined;
  const isLength = literal !== undefined && LENGTH.test(literal);
  return isLength ? literal : undefined;
}

function plainTextOf(value: PropValue) {
  const text = value.kind === "text" ? value.text.trim() : undefined;
  const isSafe = text !== undefined && text !== "" && !UNSAFE_TEXT.test(text);
  return isSafe ? text : undefined;
}

function keywordOf({ mapping, value }: {
  mapping: Mapping;
  value: PropValue;
}) {
  const key = (() => {
    const isText = value.kind === "text";
    if (isText) {
      return value.text;
    }

    const isNumber = value.kind === "number";
    if (isNumber) {
      return value.literal;
    }

    const isFlag = value.kind === "flag";
    if (isFlag) {
      return value.isOn ? "True" : "False";
    }

    const isEnumMember = value.kind === "member" && mapping.enumTypes.includes(value.qualifier);
    return isEnumMember ? value.name : undefined;
  })();
  return key === undefined ? undefined : mapping.keywords.get(key.trim().toLowerCase());
}

function tokensOf(value: PropValue) {
  const isNumber = value.kind === "number";
  if (isNumber) {
    return {
      tokens: [value.literal],
      isXaml: false
    };
  }

  const isTuple = value.kind === "tuple";
  if (isTuple) {
    return {
      tokens: value.numbers,
      isXaml: true
    };
  }

  const isNotText = value.kind !== "text";
  if (isNotText) {
    return undefined;
  }

  const isXaml = value.text.includes(",");
  return {
    tokens: value.text.trim().split(isXaml ? "," : " ").filter(token => token.trim() !== ""),
    isXaml
  };
}

function xamlToCss(values: string[]) {
  const [left = "0"] = values;
  const top = values[1] ?? left;
  const right = values[2] ?? left;
  const bottom = values[LAST_SIDE] ?? top;
  return [top, right, bottom, left];
}

function shortest(values: string[]) {
  const [top = "0"] = values;
  const right = values[1] ?? top;
  const bottom = values[2] ?? top;
  const left = values[LAST_SIDE] ?? right;
  const isUniform = top === right && right === bottom && bottom === left;
  if (isUniform) {
    return [top];
  }

  const isSymmetric = top === bottom && right === left;
  if (isSymmetric) {
    return [top, right];
  }

  return right === left ? [top, right, bottom] : [top, right, bottom, left];
}

function sidesOf({ value, isCorner }: {
  value: PropValue;
  isCorner: boolean;
}) {
  const parsed = tokensOf(value);
  const hasNoParsed = parsed === undefined;
  if (hasNoParsed) {
    return undefined;
  }

  const numbers = parsed.tokens.flatMap(token => PIXELS.exec(token.trim())?.[1] ?? []);
  const isValid = numbers.length === parsed.tokens.length && numbers.length > 0 && numbers.length <= MAX_SIDES;
  if (!isValid) {
    return undefined;
  }

  const isReordered = parsed.isXaml && !isCorner;
  const ordered = isReordered ? xamlToCss(numbers) : numbers;
  return shortest(ordered).map(side => `${side}${PIXEL_UNIT}`).join(" ");
}

function textOf({ mapping, value }: {
  mapping: Mapping;
  value: PropValue;
}) {
  switch (mapping.kind) {
    case "keyword":
      return keywordOf({
        mapping,
        value
      });
    case "length": {
      const length = numberOf(value);
      return length === undefined ? undefined : `${length}${PIXEL_UNIT}`;
    }

    case "number":
      return numberOf(value);
    case "color":
      return colorOf(value);
    case "thickness":
      return sidesOf({
        value,
        isCorner: false
      });
    case "cornerRadius":
      return sidesOf({
        value,
        isCorner: true
      });
    case "text":
      return plainTextOf(value);
    default:
      return undefined;
  }
}

function labelOf(value: PropValue) {
  const isMember = value.kind === "member";
  if (isMember) {
    return value.name;
  }

  const text = value.kind === "text" ? value.text.trim() : "";
  return /^\p{L}/u.test(text) ? text : undefined;
}

/**
 * The CSS value a prop's value lowers to, or undefined when no plain CSS value says the same thing. A condition
 * converts when each of its branches does.
 */
// A function that calls itself needs its return type written: TypeScript cannot infer one that refers to itself
export function convertValue(options: {
  mapping: Mapping;
  value: PropValue;
}): CssValue | undefined;
export function convertValue({ mapping, value }: {
  mapping: Mapping;
  value: PropValue;
}) {
  const isConditional = value.kind === "conditional";
  if (isConditional) {
    const whenTrue = convertValue({
      mapping,
      value: value.whenTrue
    });
    const whenFalse = convertValue({
      mapping,
      value: value.whenFalse
    });
    const isComplete = whenTrue !== undefined && whenFalse !== undefined;
    return isComplete ? {
      kind: "conditional",
      condition: value.condition,
      whenTrue,
      whenFalse
    } : undefined;
  }

  const text = textOf({
    mapping,
    value
  });
  return text === undefined ? undefined : {
    kind: "plain",
    text,
    label: mapping.kind === "keyword" ? labelOf(value) : undefined
  };
}
