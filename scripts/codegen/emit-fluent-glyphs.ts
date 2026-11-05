import { propsOfInputType } from "./input-type-props.ts";
import type { ClassModel } from "./model.ts";
import { FluentGlyph } from "#src/components/fluent-glyph.js";

// What the WebStorm plugin draws for a glyph: the code point of each Fluent icon
// name, and for each component the props that are a GlyphInput (the others, such as a
// rating's, take a Segoe MDL2 character and no name)

const INDENT = 2;
const GLYPH_INPUT = "GlyphInput";
const HEX_RADIX = 16;

/**
 * The Fluent icon names with their code points (in hex, as Microsoft's table writes
 * them) and the props of each component that take them as JSON.
 */
export function emitFluentGlyphs({ classes }: { classes: ClassModel[] }) {
  const glyphs = Object.fromEntries(
    Object.entries(FluentGlyph).map(([name, codePoint]) => [name, codePoint.toString(HEX_RADIX).toUpperCase()])
  );
  const attributes = propsOfInputType({
    classes,
    inputType: GLYPH_INPUT
  });
  return `${JSON.stringify({
    attributes,
    glyphs
  }, null, INDENT)}\n`;
}
