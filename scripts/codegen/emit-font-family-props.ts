import { propsOfInputType } from "./input-type-props.ts";
import type { ClassModel } from "./model.ts";

// What the WebStorm plugin reads to show each font in its own face in the
// completion of a font family: the props of each component that are a FontFamilyInput

const INDENT = 2;
const FONT_FAMILY_INPUT = "FontFamilyInput";

/**
 * The props of each component that take a font family, as JSON.
 */
export function emitFontFamilyProps({ classes }: { classes: ClassModel[] }) {
  return `${JSON.stringify({
    attributes: propsOfInputType({
      classes,
      inputType: FONT_FAMILY_INPUT
    })
  }, null, INDENT)}\n`;
}
