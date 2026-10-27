import type { NativeValue } from "#src/native-value.js";

// The plain values a component's props take, and how each is read: pure, so
// they are tested without WinUI. convert.ts turns them into the bindings'.

/** The four sides of a thickness (margin, padding, border width), in pixels. */
export interface ThicknessValue {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The four corners of a corner radius, in pixels. */
export interface CornerRadiusValue {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

/** A color as WinUI's four 0-255 channels. */
export interface ColorValue {
  a: number;
  r: number;
  g: number;
  b: number;
}

/** How a grid track is sized: to its content, to a pixel count, or to a share of what is left. */
export const GridUnit = {
  AUTO: "auto",
  PIXEL: "pixel",
  STAR: "star"
} as const;

/** A grid track unit: one of the `GridUnit` values. */
export type GridUnit = (typeof GridUnit)[keyof typeof GridUnit];

/** A grid length read from a prop: its unit and its number (pixels or star weight). */
export interface GridLengthParts {
  unit: GridUnit;
  value: number;
}

/**
 * 8 for every side, [8, 4] for left-right and top-bottom, [left, top, right,
 * bottom] as XAML writes them, or a string: CSS order ("top right bottom
 * left", 1 to 4 values, `px` allowed) or, with commas, XAML's.
 */
export type ThicknessInput =
  | number
  | string
  | readonly [number, number]
  | readonly [number, number, number, number]
  | ThicknessValue;

/**
 * The same four-sided input for a corner radius, in the order XAML writes the
 * corners: top left, top right, bottom right, bottom left.
 */
export type CornerRadiusInput =
  | number
  | string
  | readonly [number, number]
  | readonly [number, number, number, number]
  | CornerRadiusValue;

/** "#rgb", "#rrggbb", "#aarrggbb", "transparent", or WinUI's own value. */
export type ColorInput = string | ColorValue;

/**
 * An object property such as a button's content: a string, number or boolean
 * (boxed first) or an object (a control, a WinRT value) as it is; null clears
 * it. WinUI types these Object, and they hold whatever the app puts there.
 */
export type ObjectInput = string | number | boolean | object | null;

/**
 * An object property that holds only a WinRT object (a collection, a template,
 * a scroll host), never a boxed value; null clears it.
 */
export type ObjectReferenceInput = object | null;

const CSS_SEPARATOR = /\s+/u;
const LIST_SEPARATOR = ",";
const PIXEL_SUFFIX = "px";
const AUTO_KEYWORD = "Auto";
const STAR_SUFFIX = "*";
const MAX_CHANNEL = 255;
const HEX_RADIX = 16;
const SHORT_HEX_LENGTH = 3;
const ALPHA_HEX_LENGTH = 8;
const HEX_PAIR = /../gu;
const COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;
const TRANSPARENT_NAME = "transparent";
const SIDE_COUNT = 4;

const SIDE_ORDER = {
  XAML: "xaml",
  CSS: "css"
} as const;

type SideOrder = (typeof SIDE_ORDER)[keyof typeof SIDE_ORDER];

function toPixels(text: string) {
  const trimmed = text.trim();
  const digits = trimmed.endsWith(PIXEL_SUFFIX) ? trimmed.slice(0, -PIXEL_SUFFIX.length) : trimmed;
  const value = Number(digits);
  const isLength = digits !== "" && !Number.isNaN(value);
  if (!isLength) {
    throw new TypeError(`"${text}" is not a length`);
  }

  return value;
}

// A list of 1 to 4 numbers as the four sides, in the order XAML writes them
// (left, top, right, bottom) or CSS does (top, right, bottom, left).
function sidesOf({ values, order }: {
  values: readonly number[];
  order: SideOrder;
}) {
  const [first = 0, second = first, third, fourth] = values;
  const isCssOrder = order === SIDE_ORDER.CSS;
  if (isCssOrder) {
    const top = first;
    const right = second;
    return [fourth ?? right, top, right, third ?? top] as const;
  }

  return [first, second, third ?? first, fourth ?? second] as const;
}

function valuesOf(text: string) {
  const isXaml = text.includes(LIST_SEPARATOR);
  const parts = isXaml ? text.split(LIST_SEPARATOR) : text.trim().split(CSS_SEPARATOR);
  return {
    values: parts.map(toPixels),
    order: isXaml ? SIDE_ORDER.XAML : SIDE_ORDER.CSS
  };
}

function uniformSides(size: number) {
  return Array.from({ length: SIDE_COUNT }, () => size) as [number, number, number, number];
}

/** The four sides of a thickness input as [left, top, right, bottom]. */
export function thicknessSides(input: ThicknessInput) {
  const isNumber = typeof input === "number";
  if (isNumber) {
    return uniformSides(input);
  }

  const isText = typeof input === "string";
  if (isText) {
    return sidesOf(valuesOf(input));
  }

  const isThickness = "left" in input;
  if (isThickness) {
    return [input.left, input.top, input.right, input.bottom] as const;
  }

  return sidesOf({
    values: input,
    order: SIDE_ORDER.XAML
  });
}

/**
 * The four corners of a radius input as [topLeft, topRight, bottomRight,
 * bottomLeft].
 */
export function cornerSides(input: CornerRadiusInput) {
  const isNumber = typeof input === "number";
  if (isNumber) {
    return uniformSides(input);
  }

  const isText = typeof input === "string";
  if (isText) {
    return sidesOf({
      values: valuesOf(input).values,
      order: SIDE_ORDER.XAML
    });
  }

  const isCornerRadius = "topLeft" in input;
  if (isCornerRadius) {
    return [input.topLeft, input.topRight, input.bottomRight, input.bottomLeft] as const;
  }

  return sidesOf({
    values: input,
    order: SIDE_ORDER.XAML
  });
}

/** Pixels as a number, or "Auto", "*", "2*" or "120" as XAML writes them. */
export function gridLengthParts(input: number | string) {
  const isNumber = typeof input === "number";
  if (isNumber) {
    return {
      unit: GridUnit.PIXEL,
      value: input
    };
  }

  const text = input.trim();
  const isAuto = text === AUTO_KEYWORD;
  if (isAuto) {
    return {
      unit: GridUnit.AUTO,
      value: 1
    };
  }

  const isStar = text.endsWith(STAR_SUFFIX);
  if (isStar) {
    const weight = text.slice(0, -STAR_SUFFIX.length);
    const isUnweighted = weight === "";
    return {
      unit: GridUnit.STAR,
      value: isUnweighted ? 1 : toPixels(weight)
    };
  }

  return {
    unit: GridUnit.PIXEL,
    value: toPixels(text)
  };
}

/**
 * The text of a color as WinUI's four channels, or null when it is not one
 * (a theme resource name is then looked up).
 */
export function parseColor(text: string) {
  const name = text.trim().toLowerCase();
  const isTransparent = name === TRANSPARENT_NAME;
  if (isTransparent) {
    return {
      a: 0,
      r: 0,
      g: 0,
      b: 0
    };
  }

  const isColor = COLOR_PATTERN.test(name);
  if (!isColor) {
    return null;
  }

  const digits = name.slice(1);
  const isShort = digits.length === SHORT_HEX_LENGTH;
  const expanded = isShort ? [...digits].map(digit => `${digit}${digit}`).join("") : digits;
  const hasAlpha = expanded.length === ALPHA_HEX_LENGTH;
  const channels = [...expanded.matchAll(HEX_PAIR)].map(match => Number.parseInt(match[0], HEX_RADIX));
  const [alpha = MAX_CHANNEL, red = 0, green = 0, blue = 0] = hasAlpha ? channels : [MAX_CHANNEL, ...channels];
  return {
    a: alpha,
    r: red,
    g: green,
    b: blue
  };
}

/**
 * [Owner, "Property", value]: Owner's static Set<Property> is called with the
 * control and the value. A list of these sets several.
 */
export type AttachedEntry = readonly [owner: object, property: string, value: NativeValue];

/** One attached entry, or a list of them. */
export type AttachedInput = AttachedEntry | readonly AttachedEntry[];

function isEntry(input: AttachedInput): input is AttachedEntry {
  return typeof input[1] === "string";
}

/** An `attached` prop as a list of entries, whether it was written as one or several. */
export function attachedList(input: AttachedInput) {
  return isEntry(input) ? [input] : input;
}
