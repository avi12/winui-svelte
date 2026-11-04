import { inputTypeOf } from "./emit.ts";
import type { ClassModel } from "./model.ts";
import { FluentGlyph } from "#src/components/fluent-glyph.js";

// What the WebStorm plugin draws in the completion of a `glyph` prop: the code
// point of each Fluent icon name, and the components whose `glyph` is a GlyphInput
// (the others, such as a rating's, take a Segoe MDL2 character and no name)

const INDENT = 2;
const GLYPH_KEY = "glyph";
const GLYPH_INPUT = "GlyphInput";
const HEX_RADIX = 16;

function isGlyphInput(property: ClassModel["properties"][number]) {
  return property.key === GLYPH_KEY && inputTypeOf(property) === GLYPH_INPUT;
}

/**
 * The Fluent icon names with their code points (in hex, as Microsoft's table writes
 * them) and the components that take them as JSON.
 */
export function emitFluentGlyphs({ classes }: { classes: ClassModel[] }) {
  const glyphs = Object.fromEntries(
    Object.entries(FluentGlyph).map(([name, codePoint]) => [name, codePoint.toString(HEX_RADIX).toUpperCase()])
  );
  const components = classes
    .filter(level => level.isComponent && level.properties.some(isGlyphInput))
    .map(level => level.type.name)
    .toSorted();
  return `${JSON.stringify({
    components,
    glyphs
  }, null, INDENT)}\n`;
}
