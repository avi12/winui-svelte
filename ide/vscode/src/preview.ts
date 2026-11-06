import { labelOf } from "./glyph-table.ts";

const ICON_FONT_FAMILY = "'Segoe Fluent Icons', 'Segoe MDL2 Assets'";
const GLYPH_SIZE = 48;
const GLYPH_PADDING = 8;
const SWATCH_WIDTH = 96;
const SWATCH_HEIGHT = 40;
const SWATCH_RADIUS = 4;
const SWATCH_OUTLINE = "#888888";
const SAMPLE_TEXT = "Aa Bb Cc 0123 The quick brown fox";
const SAMPLE_SIZE = 22;
const SAMPLE_WIDTH = 460;
const SAMPLE_HEIGHT = 40;
const SWATCH_GAP = 12;
const LABEL_OFFSET = 14;
const LABEL_SIZE = 10;

/**
 * The CSS that draws a glyph in the icon font, for a decoration's `textDecoration` hook.
 */
export const GLYPH_FONT_STYLE = `none; font-family: ${ICON_FONT_FAMILY};`;

function imageOf({ svg, alt }: {
  svg: string;
  alt: string;
}) {
  return `![${alt}](data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")})`;
}

/**
 * Markdown that previews an icon large, as an SVG image drawn in the icon font, with its name and code point.
 */
export function glyphMarkdown({ codePoint, name, color }: {
  codePoint: number;
  name: string | undefined;
  color: string;
}) {
  const size = GLYPH_SIZE + 2 * GLYPH_PADDING;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`
    + `<text x="${size / 2}" y="${size / 2}" font-family="${ICON_FONT_FAMILY}" font-size="${GLYPH_SIZE}" `
    + `fill="${color}" text-anchor="middle" dominant-baseline="central">&#${codePoint};</text></svg>`;
  const title = name === undefined ? labelOf(codePoint) : `**${name}** ${labelOf(codePoint)}`;
  return `${imageOf({
    svg,
    alt: name ?? labelOf(codePoint)
  })}\n\n${title}`;
}

/**
 * Markdown that previews a CSS color as a swatch with its value.
 */
export function colorMarkdown(css: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SWATCH_WIDTH}" height="${SWATCH_HEIGHT}">`
    + `<rect width="${SWATCH_WIDTH}" height="${SWATCH_HEIGHT}" rx="${SWATCH_RADIUS}" fill="${css}" `
    + `stroke="${SWATCH_OUTLINE}"/></svg>`;
  return `${imageOf({
    svg,
    alt: css
  })}\n\n\`${css}\``;
}

/**
 * Markdown that previews a font family: a line of text drawn in it, in the theme's text color.
 */
export function fontMarkdown({ family, color }: {
  family: string;
  color: string;
}) {
  const name = family.replaceAll(/["'<>&]/gu, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SAMPLE_WIDTH}" height="${SAMPLE_HEIGHT}">`
    + `<text x="0" y="${SAMPLE_HEIGHT / 2}" font-family="'${name}'" font-size="${SAMPLE_SIZE}" fill="${color}" `
    + `dominant-baseline="central">${SAMPLE_TEXT}</text></svg>`;
  return `${imageOf({
    svg,
    alt: name
  })}\n\n**${name}**`;
}

function themeSwatch({ label, css, x }: {
  label: string;
  css: string | undefined;
  x: number;
}) {
  const fill = css === undefined ? "none" : css;
  return `<rect x="${x}" width="${SWATCH_WIDTH}" height="${SWATCH_HEIGHT}" rx="${SWATCH_RADIUS}" fill="${fill}" `
    + `stroke="${SWATCH_OUTLINE}"/><text x="${x + SWATCH_WIDTH / 2}" y="${SWATCH_HEIGHT + LABEL_OFFSET}" `
    + `font-size="${LABEL_SIZE}" fill="${SWATCH_OUTLINE}" text-anchor="middle">${label}</text>`;
}

/**
 * Markdown that previews a WinUI resource: its name and kind and, for a color, a swatch of it in the light theme and
 * in the dark one, each with its value.
 */
export function resourceMarkdown(resource: {
  name: string;
  kind: string;
  light?: string | undefined;
  dark?: string | undefined;
}) {
  const heading = `**${resource.name}** ${resource.kind}`;
  const { light, dark } = resource;
  const hasSwatch = light !== undefined || dark !== undefined;
  if (!hasSwatch) {
    return heading;
  }

  const width = 2 * SWATCH_WIDTH + SWATCH_GAP;
  const height = SWATCH_HEIGHT + LABEL_OFFSET + LABEL_SIZE;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + themeSwatch({
      label: "light",
      css: light,
      x: 0
    })
    + themeSwatch({
      label: "dark",
      css: dark,
      x: SWATCH_WIDTH + SWATCH_GAP
    })
    + "</svg>";
  const values = [`light \`${light ?? "follows the system"}\``, `dark \`${dark ?? "follows the system"}\``];
  return `${imageOf({
    svg,
    alt: resource.name
  })}\n\n${heading}\n\n${values.join(" · ")}`;
}
