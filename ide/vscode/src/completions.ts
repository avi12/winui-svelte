import { namedColors } from "../../../src/css/parse/named-colors.ts";
import { installedFamilies } from "./font-families.ts";
import { fluentCodePoints, labelOf } from "./glyph-table.ts";
import { fontMarkdown, glyphMarkdown } from "./preview.ts";
import { SpotKind } from "./spots.ts";
import type { Spot } from "./spots.ts";

interface Entry {
  label: string;
  insertText: string;
  detail: string;
  markdown: string | undefined;
  color: string | undefined;
}

function glyphEntries(foreground: string) {
  return [...fluentCodePoints()].map(([name, codePoint]) => ({
    label: name,
    insertText: name,
    detail: labelOf(codePoint),
    markdown: glyphMarkdown({
      codePoint,
      name,
      color: foreground
    }),
    color: undefined
  } satisfies Entry));
}

function colorEntries() {
  return [...namedColors].map(([name, hex]) => ({
    label: name,
    insertText: name,
    detail: `#${hex}`,
    markdown: undefined,
    color: `#${hex}`
  } satisfies Entry));
}

async function fontEntries(foreground: string) {
  return (await installedFamilies()).map(family => {
    const hasSpace = family.includes(" ");
    return {
      label: family,
      insertText: hasSpace ? `'${family}'` : family,
      detail: "installed font",
      markdown: fontMarkdown({
        family,
        color: foreground
      }),
      color: undefined
    } satisfies Entry;
  });
}

/**
 * What to offer in the value a spot sits in, each with the preview that shows beside it: the Fluent icons with their
 * glyph, the CSS color names with a swatch, the installed fonts with a line drawn in each.
 */
export async function entriesOf({ spot, foreground }: {
  spot: Spot;
  foreground: string;
}) {
  const isGlyph = spot.kind === SpotKind.GLYPH;
  if (isGlyph) {
    return glyphEntries(foreground);
  }

  const isColor = spot.kind === SpotKind.COLOR;
  if (isColor) {
    return colorEntries();
  }

  return fontEntries(foreground);
}
