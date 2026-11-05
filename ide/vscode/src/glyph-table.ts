import raw from "../../webstorm/src/main/resources/fluent-glyphs.json" with { type: "json" };
import { listsProp, typedPropsTableSchema } from "./typed-props-table.ts";
import { z } from "zod";

const HEX_RADIX = 16;
const CODE_POINT_DIGITS = 4;
const tableSchema = typedPropsTableSchema.extend({ glyphs: z.record(z.string(), z.string()) });
const table = tableSchema.parse(raw);
const codePoints = new Map(Object.entries(table.glyphs).map(([name, hex]) => [name, Number.parseInt(hex, HEX_RADIX)]));

/**
 * The code point of each Fluent icon, by the name Microsoft gives it.
 */
export function fluentCodePoints() {
  return codePoints;
}

/**
 * Whether WinUI's own component takes an icon in the prop (`glyph` on a `FontIcon`).
 */
export function isGlyphAttribute({ tag, attribute }: {
  tag: string;
  attribute: string;
}) {
  return listsProp({
    table,
    tag,
    attribute
  });
}

/**
 * The code point a `glyph` value means: a Fluent name, or the single icon character itself.
 */
export function codePointOf(value: string) {
  const named = codePoints.get(value);
  const hasName = named !== undefined;
  if (hasName) {
    return named;
  }

  const isSingleCharacter = Array.from(value).length === 1;
  const character = value.codePointAt(0);
  const isIcon = isSingleCharacter && character !== undefined && [...codePoints.values()].includes(character);
  return isIcon ? character : undefined;
}

/**
 * The Fluent name of a code point, if it has one.
 */
export function glyphNameOf(codePoint: number) {
  return [...codePoints].find(([, point]) => point === codePoint)?.[0];
}

/**
 * The `U+E74E` a code point is written as.
 */
export function labelOf(codePoint: number) {
  return `U+${codePoint.toString(HEX_RADIX).toUpperCase().padStart(CODE_POINT_DIGITS, "0")}`;
}
