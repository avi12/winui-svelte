import { PictureKind, pictureTargetOf } from "./picture-paths.ts";

export const Variant = {
  ANY: "any",
  LIGHT: "light",
  DARK: "dark"
} as const;
export type Variant = (typeof Variant)[keyof typeof Variant];

export interface PictureNames {
  names: Set<string>;
  variants: Map<string, "light" | "dark">;
}

export interface PictureSpot {
  start: number;
  end: number;
  value: string;
  variant: Variant;
  group: number;
}

const STRING_LITERAL = /(["'\x60])([^"'\x60$]*)\1/gu;
const KEY_LITERAL = /\b([A-Za-z_$][\w$]*)\s*:\s*(["'\x60])([^"'\x60$]*)\2/gu;
const KEY_BEFORE = /([A-Za-z_$][\w$]*)\s*:\s*$/u;
const OPENING = "{";
const CLOSING = "}";

function isPicture(value: string) {
  return pictureTargetOf({
    value,
    file: "/",
    root: "/"
  }).kind !== PictureKind.NONE;
}

function variantOf({ key, names }: {
  key: string;
  names: PictureNames;
}) {
  return names.variants.get(key) ?? Variant.ANY;
}

// The object the offset sits in: the position of its nearest unclosed `{`, so that the two pictures of a light and
// dark pair share a group.
function enclosingBrace({ text, offset }: {
  text: string;
  offset: number;
}) {
  let depth = 0;
  for (let i = offset - 1; i >= 0; i -= 1) {
    const char = text.charAt(i);
    depth += char === CLOSING ? 1 : 0;
    const isOpening = char === OPENING;
    const isOwnBrace = isOpening && depth === 0;
    if (isOwnBrace) {
      return i;
    }

    depth -= isOpening ? 1 : 0;
  }

  return -1;
}

/**
 * The picture a plain attribute value names (`icon="tray.ico"`).
 */
export function plainSpots({ attribute, value, start, names }: {
  attribute: string;
  value: string;
  start: number;
  names: PictureNames;
}) {
  const leading = value.length - value.trimStart().length;
  const text = value.trim();
  return isPicture(text) ? [{
    start: start + leading,
    end: start + leading + text.length,
    value: text,
    variant: variantOf({
      key: attribute,
      names
    }),
    group: start
  } satisfies PictureSpot] : [];
}

/**
 * The pictures an attribute expression names: each string of it, as the key before it says which taskbar it is for.
 */
export function expressionSpots({ attribute, expression, start, names }: {
  attribute: string;
  expression: string;
  start: number;
  names: PictureNames;
}) {
  return [...expression.matchAll(STRING_LITERAL)].flatMap(literal => {
    const value = literal[2] ?? "";
    const before = KEY_BEFORE.exec(expression.slice(0, literal.index))?.[1] ?? attribute;
    const key = names.variants.has(before) ? before : attribute;
    return isPicture(value) ? [{
      start: start + literal.index + 1,
      end: start + literal.index + 1 + value.length,
      value,
      variant: variantOf({
        key,
        names
      }),
      group: start
    } satisfies PictureSpot] : [];
  });
}

/**
 * The pictures written as `key: "..."` anywhere in a file: the options and items of a script, whose key the
 * library types as a picture.
 */
export function keySpots({ text, names }: {
  text: string;
  names: PictureNames;
}) {
  return [...text.matchAll(KEY_LITERAL)].flatMap(match => {
    const [whole, key = "", , value = ""] = match;
    const isWanted = names.names.has(key) && isPicture(value);
    const start = match.index + whole.length - value.length - 1;
    return isWanted ? [{
      start,
      end: start + value.length,
      value,
      variant: variantOf({
        key,
        names
      }),
      group: enclosingBrace({
        text,
        offset: match.index
      })
    } satisfies PictureSpot] : [];
  });
}

/**
 * The spots with a repeated start dropped, the first kept.
 */
export function uniqueSpots(spots: PictureSpot[]) {
  const seen = new Set<number>();
  return spots.filter(spot => {
    const isNew = !seen.has(spot.start);
    seen.add(spot.start);
    return isNew;
  });
}
