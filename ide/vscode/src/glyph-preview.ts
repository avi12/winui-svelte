import { labelOf } from "./glyph-table.ts";

const FONT_FAMILY = "'Segoe Fluent Icons', 'Segoe MDL2 Assets'";
const PREVIEW_SIZE = 48;
const PREVIEW_PADDING = 8;

/**
 * The CSS that draws a glyph in the icon font, for a decoration's `textDecoration` hook.
 */
export const GLYPH_FONT_STYLE = `none; font-family: ${FONT_FAMILY};`;

/**
 * Markdown that previews an icon large, as an SVG image drawn in the icon font, with its name and code point.
 */
export function previewMarkdown({ codePoint, name, color }: {
  codePoint: number;
  name: string | undefined;
  color: string;
}) {
  const size = PREVIEW_SIZE + 2 * PREVIEW_PADDING;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`
    + `<text x="${size / 2}" y="${size / 2}" font-family="${FONT_FAMILY}" font-size="${PREVIEW_SIZE}" `
    + `fill="${color}" text-anchor="middle" dominant-baseline="central">&#${codePoint};</text></svg>`;
  const title = name === undefined ? labelOf(codePoint) : `**${name}** ${labelOf(codePoint)}`;
  return `![${name ?? labelOf(codePoint)}](data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")})\n\n${title}`;
}
