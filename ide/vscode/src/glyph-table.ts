import raw from "../../webstorm/src/main/resources/fluent-glyphs.json" with { type: "json" };
import { z } from "zod";

const HEX_RADIX = 16;
const tableSchema = z.object({
  attributes: z.record(z.string(), z.array(z.string())),
  glyphs: z.record(z.string(), z.string())
});
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
  return table.attributes[tag]?.includes(attribute) === true;
}

/**
 * The code point a `glyph` value means: a Fluent name, or the single icon character itself.
 */
export function codePointOf(value: string) {
  const named = codePoints.get(value);
  if (named !== undefined) {
    return named;
  }

  const isSingleCharacter = [...value].length === 1;
  const character = value.codePointAt(0);
  const isIcon = isSingleCharacter && character !== undefined && [...codePoints.values()].includes(character);
  return isIcon ? character : undefined;
}

/**
 * The `U+E74E` a code point is written as.
 */
export function labelOf(codePoint: number) {
  return `U+${codePoint.toString(HEX_RADIX).toUpperCase().padStart(4, "0")}`;
}
