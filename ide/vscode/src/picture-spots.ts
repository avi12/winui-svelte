import { isPicture } from "./picture-paths.ts";

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
const KEY_URL = /\b([A-Za-z_$][\w$]*)\s*:\s*new\s+URL\(\s*(["'\x60])([^"'\x60$]*)\2/gu;
const KEY_IDENT = /\b([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)(?=\s*(?:[,})]|\.(?:href|pathname)\b|\r?\n|$))/gu;
const IDENT = /[A-Za-z_$][\w$]*/gu;
const KEY_BEFORE = /([A-Za-z_$][\w$]*)\s*:\s*$/u;
const OPENING = "{";
const CLOSING = "}";

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

// The names of an expression that are not inside a string, a property (`a.logo`), a call (`logo()`) or an object key.
function identifiersOf(expression: string) {
  const masked = expression.replace(STRING_LITERAL, literal => " ".repeat(literal.length));
  return [...masked.matchAll(IDENT)].filter(match => {
    const before = masked.slice(0, match.index).trimEnd();
    const after = masked.slice(match.index + match[0].length).trimStart();
    const isMember = masked.charAt(match.index - 1) === ".";
    const isCall = after.startsWith("(");
    const isKey = after.startsWith(":") && (before.endsWith("{") || before.endsWith(","));
    return !isMember && !isCall && !isKey;
  });
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
 * The pictures an attribute expression names: each string of it and each name the file binds to a picture, as the
 * key before it says which taskbar it is for.
 */
export function expressionSpots({ attribute, expression, start, names, bindings = new Map() }: {
  attribute: string;
  expression: string;
  start: number;
  names: PictureNames;
  bindings?: Map<string, string>;
}) {
  function spotAt({ index, length, value, quoteWidth }: {
    index: number;
    length: number;
    value: string;
    quoteWidth: number;
  }) {
    const before = KEY_BEFORE.exec(expression.slice(0, index - quoteWidth))?.[1] ?? attribute;
    const key = names.variants.has(before) ? before : attribute;
    return {
      start: start + index,
      end: start + index + length,
      value,
      variant: variantOf({
        key,
        names
      }),
      group: start
    } satisfies PictureSpot;
  }

  const strings = [...expression.matchAll(STRING_LITERAL)].flatMap(literal => {
    const value = literal[2] ?? "";
    return isPicture(value) ? [spotAt({
      index: literal.index + 1,
      length: value.length,
      value,
      quoteWidth: 1
    })] : [];
  });
  const references = identifiersOf(expression).flatMap(match => {
    const value = bindings.get(match[0]);
    return value === undefined ? [] : [spotAt({
      index: match.index,
      length: match[0].length,
      value,
      quoteWidth: 0
    })];
  });
  return [...strings, ...references].sort((first, second) => first.start - second.start);
}

/**
 * The pictures written as `key: ...` anywhere in a file, for a key the library types as a picture: the options and
 * items of a script. The value is a string, `new URL("./x.png", import.meta.url)`, or a name the file binds to a
 * picture (`icon: logo`, `icon: url.href`).
 */
export function keySpots({ text, names, bindings = new Map() }: {
  text: string;
  names: PictureNames;
  bindings?: Map<string, string>;
}) {
  function spotAt({ index, key, value, start, end }: {
    index: number;
    key: string;
    value: string;
    start: number;
    end: number;
  }) {
    return {
      start,
      end,
      value,
      variant: variantOf({
        key,
        names
      }),
      group: enclosingBrace({
        text,
        offset: index
      })
    } satisfies PictureSpot;
  }

  const literals = [...text.matchAll(KEY_LITERAL), ...text.matchAll(KEY_URL)].flatMap(match => {
    const [whole, key = "", , value = ""] = match;
    const isWanted = names.names.has(key) && isPicture(value);
    const start = match.index + whole.length - value.length - 1;
    return isWanted ? [spotAt({
      index: match.index,
      key,
      value,
      start,
      end: start + value.length
    })] : [];
  });
  const references = [...text.matchAll(KEY_IDENT)].flatMap(match => {
    const [whole, key = "", name = ""] = match;
    const value = bindings.get(name);
    const isWanted = names.names.has(key) && value !== undefined;
    const start = match.index + whole.length - name.length;
    return isWanted ? [spotAt({
      index: match.index,
      key,
      value,
      start,
      end: start + name.length
    })] : [];
  });
  return [...literals, ...references].sort((first, second) => first.start - second.start);
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
