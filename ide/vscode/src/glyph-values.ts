import { isGlyphProp } from "./glyph-prop.ts";
import { scanAttributes } from "./glyph-scan.ts";
import type { AttributeValue } from "./glyph-scan.ts";
import { isWinuiFile } from "./winui-project.ts";

/**
 * The values of the props that take a GlyphInput in a Svelte file of a project that depends on winui-svelte.
 */
export async function glyphValues({ text, file }: {
  text: string;
  file: string;
}) {
  if (!await isWinuiFile(file)) {
    return [];
  }

  const values = scanAttributes(text);
  const checks = await Promise.all(values.map(value => isGlyphProp({
    tag: value.tag,
    attribute: value.attribute,
    documentText: text,
    documentFile: file
  })));
  return values.filter((_value, iValue) => checks[iValue] === true);
}

/**
 * The glyph value the offset is inside (or at the edge of), if any.
 */
export function glyphValueAt({ values, offset }: {
  values: AttributeValue[];
  offset: number;
}) {
  return values.find(value => value.valueStart <= offset && offset <= value.valueEnd);
}
