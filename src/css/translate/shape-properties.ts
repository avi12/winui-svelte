import {
  enumMap,
  keywordProperty,
  lengthProperty,
  setter,
  simple
} from "./property-kit.ts";
import type { GroupInput, PropertyGroup } from "./property-kit.ts";
import type { Reader } from "#src/css/parse/reader.js";
import { parseLength, parseNumber, splitWords } from "#src/css/parse/values.js";

const STROKE_WIDTH = "stroke-width";
const STROKE_DASHARRAY = "stroke-dasharray";
const STROKE_DASHOFFSET = "stroke-dashoffset";
const STROKE_LINECAP = "stroke-linecap";
const NONE = "none";
const TRANSPARENT = "transparent";
const DEFAULT_THICKNESS = 1;
const MINIMUM_MITER_LIMIT = 1;
const DASH_PRECISION = 1000;

/** `stroke-linecap`, as PenLineCap. */
const lineCaps = enumMap([
  ["butt", "Flat"],
  ["round", "Round"],
  ["square", "Square"]
]);

/** `stroke-linejoin`, as PenLineJoin. */
const lineJoins = enumMap([
  ["miter", "Miter"],
  ["bevel", "Bevel"],
  ["round", "Round"]
]);

/** `fill-rule`, as FillRule. */
const fillRules = enumMap([
  ["nonzero", "Nonzero"],
  ["evenodd", "EvenOdd"]
]);

// WinUI counts dashes in multiples of the stroke's thickness, CSS in pixels.
function thicknessOf({ input, reader }: {
  input: GroupInput;
  reader: Reader;
}) {
  const declaration = input.computed.get(STROKE_WIDTH);
  const hasThickness = declaration !== undefined;
  if (!hasThickness) {
    return DEFAULT_THICKNESS;
  }

  const thickness = parseLength(declaration.value.trim());
  const isUsable = thickness !== null && thickness > 0;
  if (isUsable) {
    return thickness;
  }

  reader.warn(`${reader.declaration.property}: ${STROKE_WIDTH} is not a length in px, so the dashes are read as multiples of 1px`);
  return DEFAULT_THICKNESS;
}

function inThicknesses({ pixels, thickness }: {
  pixels: number;
  thickness: number;
}) {
  return Math.round(pixels / thickness * DASH_PRECISION) / DASH_PRECISION;
}

function dashLengths({ reader, thickness }: {
  reader: Reader;
  thickness: number;
}) {
  const lengths: number[] = [];
  for (const token of splitWords(reader.declaration.value.replaceAll(",", " "))) {
    const pixels = parseLength(token);
    const isLength = pixels !== null && pixels >= 0;
    if (!isLength) {
      return reader.expectedToken({
        what: "lengths in px, not negative",
        token
      });
    }

    lengths.push(
      inThicknesses({
        pixels,
        thickness
      })
    );
  }

  return lengths;
}

/** `stroke-dasharray`: lengths in px (or `none`), as StrokeDashArray in multiples of the stroke's thickness. */
function strokeDashArray(input: GroupInput) {
  const reader = input.reading(STROKE_DASHARRAY);
  const isNone = reader.declaration.value.trim().toLowerCase() === NONE;
  if (isNone) {
    return [setter({
      property: "StrokeDashArray",
      value: ""
    })];
  }

  const lengths = dashLengths({
    reader,
    thickness: thicknessOf({
      input,
      reader
    })
  });
  const isUnreadable = lengths === null || lengths.length === 0;
  return isUnreadable ? [] : [setter({
    property: "StrokeDashArray",
    value: lengths.join(",")
  })];
}

/** `stroke-dashoffset`: a length in px, as StrokeDashOffset in multiples of the stroke's thickness. */
function strokeDashOffset(input: GroupInput) {
  const reader = input.reading(STROKE_DASHOFFSET);
  const word = reader.single();
  const pixels = word === null ? null : reader.pixels(word);
  const isPixelsMissing = pixels === null;
  if (isPixelsMissing) {
    return [];
  }

  return [setter({
    property: "StrokeDashOffset",
    value: String(
      inThicknesses({
        pixels,
        thickness: thicknessOf({
          input,
          reader
        })
      })
    )
  })];
}

/** `stroke-linecap`: WinUI caps the two ends apart; CSS caps both alike. */
function strokeLineCap(input: GroupInput) {
  const reader = input.reading(STROKE_LINECAP);
  const word = reader.single();
  const cap = word === null ? null : reader.keyword({
    token: word,
    choices: lineCaps
  });
  const isCapMissing = cap === null;
  if (isCapMissing) {
    return [];
  }

  return ["StrokeStartLineCap", "StrokeEndLineCap"].map(property => setter({
    property,
    value: cap
  }));
}

/** `stroke-miterlimit`: a number of at least 1. */
function miterLimit(reader: Reader) {
  const word = reader.single();
  const isWordMissing = word === null;
  if (isWordMissing) {
    return null;
  }

  const limit = parseNumber(word);
  const isInRange = limit !== null && limit >= MINIMUM_MITER_LIMIT;
  return isInRange ? String(limit) : reader.expectedToken({
    what: "a number of at least 1",
    token: word
  });
}

/** `fill`: a color or `var()` as the Fill brush; `none` is a transparent one. */
function fillBrush(reader: Reader) {
  const word = reader.single();
  const isWordMissing = word === null;
  if (isWordMissing) {
    return null;
  }

  return reader.brush(word.toLowerCase() === NONE ? TRANSPARENT : word);
}

/** The CSS properties of an SVG shape that a WinUI Shape draws with. */
export const shapePropertyGroups: readonly PropertyGroup[] = [
  simple({
    member: "fill",
    property: "Fill",
    parse: fillBrush
  }),
  {
    members: [STROKE_DASHARRAY],
    property: "StrokeDashArray",
    lower: strokeDashArray
  },
  {
    members: [STROKE_DASHOFFSET],
    property: "StrokeDashOffset",
    lower: strokeDashOffset
  },
  {
    members: [STROKE_LINECAP],
    lower: strokeLineCap
  },
  keywordProperty({
    member: "stroke-linejoin",
    property: "StrokeLineJoin",
    choices: lineJoins
  }),
  simple({
    member: "stroke-miterlimit",
    property: "StrokeMiterLimit",
    parse: miterLimit
  }),
  lengthProperty({
    member: "rx",
    property: "RadiusX"
  }),
  lengthProperty({
    member: "ry",
    property: "RadiusY"
  }),
  keywordProperty({
    member: "fill-rule",
    property: "FillRule",
    choices: fillRules
  })
];
