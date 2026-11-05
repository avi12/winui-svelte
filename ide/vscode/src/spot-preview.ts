import { cssColorOf } from "./css-color.ts";
import { codePointOf, glyphNameOf } from "./glyph-table.ts";
import { colorMarkdown, fontMarkdown, glyphMarkdown } from "./preview.ts";
import { SpotKind } from "./spots.ts";
import type { Spot } from "./spots.ts";

/**
 * The markdown that previews what a spot's text means (the icon, the color, the font), or undefined when the
 * text means nothing yet.
 */
export function previewOfSpot({ spot, foreground }: {
  spot: Spot;
  foreground: string;
}) {
  const isFont = spot.kind === SpotKind.FONT;
  if (isFont) {
    const isEmpty = spot.text === "";
    return isEmpty ? undefined : fontMarkdown({
      family: spot.text,
      color: foreground
    });
  }

  const isColor = spot.kind === SpotKind.COLOR;
  if (isColor) {
    const css = cssColorOf(spot.text);
    return css === undefined ? undefined : colorMarkdown(css);
  }

  const codePoint = codePointOf(spot.text);
  return codePoint === undefined ? undefined : glyphMarkdown({
    codePoint,
    name: glyphNameOf(codePoint),
    color: foreground
  });
}
