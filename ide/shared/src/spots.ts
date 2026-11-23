import { isColorAttribute, isColorProperty } from "./color-table.ts";
import { isFontFamilyAttribute } from "./font-table.ts";
import { isGlyphAttribute } from "./glyph-table.ts";
import { scanAttributes, scanExpressionAttributes } from "./markup-scan.ts";
import type { AttributeValue } from "./markup-scan.ts";
import { isTypedProp } from "./typed-prop.ts";
import { isWinuiFile } from "./winui-project.ts";

export const SpotKind = {
  GLYPH: "glyph",
  COLOR: "color",
  FONT: "font"
} as const;
export type SpotKind = (typeof SpotKind)[keyof typeof SpotKind];

export interface Spot {
  kind: SpotKind;
  start: number;
  end: number;
  text: string;
}

const STYLE = "style";
const STYLE_DIRECTIVE = "style:";
const FONT_FAMILY = "font-family";
const STRING_LITERAL = /(["'\x60])([^"'\x60\\$]*)\1/gu;
const GLYPH_INPUT = "GlyphInput";
const FONT_FAMILY_INPUT = "FontFamilyInput";

function trimmedSpot({ kind, text, start }: {
  kind: SpotKind;
  text: string;
  start: number;
}) {
  const leading = text.length - text.trimStart().length;
  const trimmed = text.trim();
  return {
    kind,
    start: start + leading,
    end: start + leading + trimmed.length,
    text: trimmed
  };
}

function families({ value, start }: {
  value: string;
  start: number;
}) {
  let cursor = start;
  return value.split(",").map(part => {
    const spot = trimmedSpot({
      kind: SpotKind.FONT,
      text: part,
      start: cursor
    });
    cursor += part.length + 1;
    return {
      ...spot,
      text: spot.text.replaceAll(/^["']|["']$/gu, "")
    };
  });
}

function propertySpots({ property, value, start }: {
  property: string;
  value: string;
  start: number;
}) {
  const isFontFamily = property === FONT_FAMILY;
  if (isFontFamily) {
    return families({
      value,
      start
    });
  }

  if (!isColorProperty(property)) {
    return [];
  }

  return [trimmedSpot({
    kind: SpotKind.COLOR,
    text: value.replace(/!important\s*$/u, ""),
    start
  })];
}

function styleSpots({ value, start }: {
  value: string;
  start: number;
}) {
  let cursor = start;
  return value.split(";").flatMap(declaration => {
    const declarationStart = cursor;
    cursor += declaration.length + 1;
    const colon = declaration.indexOf(":");
    const hasNoColon = colon === -1;
    if (hasNoColon) {
      return [];
    }

    return propertySpots({
      property: declaration.slice(0, colon).trim().toLowerCase(),
      value: declaration.slice(colon + 1),
      start: declarationStart + colon + 1
    });
  });
}

async function kindOfProp({ tag, attribute, text, file }: {
  tag: string;
  attribute: string;
  text: string;
  file: string;
}) {
  const context = {
    tag,
    attribute,
    documentText: text,
    documentFile: file
  };
  const [isGlyph, isFont] = await Promise.all([
    isTypedProp({
      ...context,
      isOwn: isGlyphAttribute({
        tag,
        attribute
      }),
      inputType: GLYPH_INPUT
    }),
    isTypedProp({
      ...context,
      isOwn: isFontFamilyAttribute({
        tag,
        attribute
      }),
      inputType: FONT_FAMILY_INPUT
    })
  ]);
  if (isGlyph) {
    return SpotKind.GLYPH;
  }

  if (isFont) {
    return SpotKind.FONT;
  }

  return isColorAttribute(attribute) ? SpotKind.COLOR : undefined;
}

function spotsOfKind({ kind, value, start }: {
  kind: SpotKind;
  value: string;
  start: number;
}) {
  const isFont = kind === SpotKind.FONT;
  if (isFont) {
    return families({
      value,
      start
    });
  }

  return [trimmedSpot({
    kind,
    text: value,
    start
  })];
}

async function spotsOfValue({ found, text, file }: {
  found: AttributeValue;
  text: string;
  file: string;
}) {
  const { tag, attribute, value, valueStart } = found;
  const isStyle = attribute === STYLE;
  if (isStyle) {
    return styleSpots({
      value,
      start: valueStart
    });
  }

  if (attribute.startsWith(STYLE_DIRECTIVE)) {
    return propertySpots({
      property: attribute.slice(STYLE_DIRECTIVE.length),
      value,
      start: valueStart
    });
  }

  const kind = await kindOfProp({
    tag,
    attribute,
    text,
    file
  });
  return kind === undefined ? [] : spotsOfKind({
    kind,
    value,
    start: valueStart
  });
}

async function spotsOfExpression({ found, text, file }: {
  found: AttributeValue;
  text: string;
  file: string;
}) {
  const { tag, attribute, value, valueStart } = found;
  const isStyle = attribute === STYLE;
  if (isStyle) {
    return [];
  }

  const isDirective = attribute.startsWith(STYLE_DIRECTIVE);
  const kind = isDirective ? undefined : await kindOfProp({
    tag,
    attribute,
    text,
    file
  });
  return [...value.matchAll(STRING_LITERAL)].flatMap(literal => {
    const start = valueStart + literal.index + 1;
    const content = literal[2] ?? "";
    if (isDirective) {
      return propertySpots({
        property: attribute.slice(STYLE_DIRECTIVE.length),
        value: content,
        start
      });
    }

    return kind === undefined ? [] : spotsOfKind({
      kind,
      value: content,
      start
    });
  });
}

/**
 * The glyphs, colors and font families written as values in a Svelte file of a project that depends on winui-svelte:
 * a prop typed GlyphInput or FontFamilyInput (wrapper components too), a color prop, a `style:` directive and the
 * declarations of a `style` attribute.
 */
export async function spotsOf({ text, file }: {
  text: string;
  file: string;
}) {
  if (!await isWinuiFile(file)) {
    return [];
  }

  const found = scanAttributes(text);
  const [perValue, perExpression] = await Promise.all([
    Promise.all(
      found.map(value => spotsOfValue({
        found: value,
        text,
        file
      }))
    ),
    Promise.all(
      scanExpressionAttributes(text).map(value => spotsOfExpression({
        found: value,
        text,
        file
      }))
    )
  ]);
  return [...perValue.flat(), ...perExpression.flat()];
}

/**
 * The spot the offset is inside (or at the edge of), if any.
 */
export function spotAt({ spots, offset }: {
  spots: Spot[];
  offset: number;
}) {
  return spots.find(spot => spot.start <= offset && offset <= spot.end);
}
