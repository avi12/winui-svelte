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

/** A length of time in WinRT's 100 ns ticks. */
export interface TimeSpanValue {
  duration: bigint;
}

/**
 * A length of time: a number of milliseconds, or text with its unit ("0.3s",
 * "300ms", "2m", "1h") or as a clock ("0:00:05", "00:00:00.3"; text without a
 * unit is milliseconds), or WinUI's own value.
 */
export type TimeSpanInput = number | string | TimeSpanValue;

/** A duration as WinUI stores it: `type` is its DurationType. */
export interface DurationValue {
  timeSpan: TimeSpanValue;
  type: number;
}

/**
 * How long a timeline plays: a number of milliseconds, text such as "0.3s",
 * "auto" for the length of its content, "forever", or WinUI's own value.
 */
export type DurationInput = number | string | DurationValue;

/** The moment of a key frame as WinUI stores it. */
export interface KeyTimeValue {
  timeSpan: TimeSpanValue;
}

/** When a key frame is reached, from the start: a time span (see `TimeSpanInput`) or WinUI's own value. */
export type KeyTimeInput = number | string | KeyTimeValue;

/** A repeat behavior as WinUI stores it: `type` is its RepeatBehaviorType. */
export interface RepeatBehaviorValue {
  count: number;
  duration: TimeSpanValue;
  type: number;
}

/**
 * How a timeline repeats: a number of times (3, or "3x"), a length of time
 * ("2s"), "forever", or WinUI's own value.
 */
export type RepeatBehaviorInput = number | string | RepeatBehaviorValue;

/** A font weight as WinUI stores it, 1 to 999. */
export interface FontWeightValue {
  weight: number;
}

const FONT_WEIGHTS = {
  thin: 100,
  extraLight: 200,
  light: 300,
  semiLight: 350,
  normal: 400,
  regular: 400,
  medium: 500,
  semiBold: 600,
  bold: 700,
  extraBold: 800,
  black: 900,
  extraBlack: 950
} as const;

/** The names WinUI's FontWeights gives the weights, and "regular" for normal. */
export type FontWeightName = keyof typeof FONT_WEIGHTS;

/** A weight by name ("bold") or number (700), or WinUI's own value. */
export type FontWeightInput = FontWeightName | number | FontWeightValue;

/** A point in device-independent pixels. */
export interface PointValue {
  x: number;
  y: number;
}

/** A point: [x, y], "x,y", or {x, y}. */
export type PointInput = readonly [number, number] | string | PointValue;

/** A width and a height in device-independent pixels. */
export interface SizeValue {
  width: number;
  height: number;
}

/** A size: [width, height], "width,height", or {width, height}. */
export type SizeInput = readonly [number, number] | string | SizeValue;

/** A rectangle in device-independent pixels. */
export interface RectValue {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A rectangle: [x, y, width, height], "x,y,width,height", or {x, y, width, height}. */
export type RectInput = readonly [number, number, number, number] | string | RectValue;

/** A 2D transform matrix as WinUI stores it. */
export interface MatrixValue {
  m11: number;
  m12: number;
  m21: number;
  m22: number;
  offsetX: number;
  offsetY: number;
}

/** A matrix: [m11, m12, m21, m22, offsetX, offsetY], the same as a string, or the object with those names. */
export type MatrixInput = readonly [number, number, number, number, number, number] | string | MatrixValue;

/** Three numbers: a scale, a translation, an axis. */
export interface Vector3Value {
  x: number;
  y: number;
  z: number;
}

/** A vector: [x, y, z], "x,y,z", or {x, y, z}. */
export type Vector3Input = readonly [number, number, number] | string | Vector3Value;

/** A moment as WinUI stores it: 100 ns ticks since 1601-01-01 UTC. */
export interface DateTimeValue {
  universalTime: bigint;
}

/** A moment: a `Date`, milliseconds since 1970 UTC, an ISO 8601 string, or WinUI's own value. */
export type DateInput = Date | number | string | DateTimeValue;

/** A list of numbers: an array, or text separated by commas or spaces. */
export type NumbersInput = readonly number[] | string;

/** A list of points: an array of points, or text of coordinate pairs ("0,0 10,10 20,0"). */
export type PointListInput = readonly PointInput[] | string;

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

const TICKS_PER_MILLISECOND = 10_000;
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MILLISECONDS_PER_MINUTE = SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
const MILLISECONDS_PER_HOUR = MINUTES_PER_HOUR * MILLISECONDS_PER_MINUTE;
const MILLISECONDS_PER_UNIT = new Map([
  ["ms", 1],
  ["s", MILLISECONDS_PER_SECOND],
  ["m", MILLISECONDS_PER_MINUTE],
  ["h", MILLISECONDS_PER_HOUR]
]);
const DEFAULT_TIME_UNIT = "ms";
const UNIT_PATTERN = /^(-?(?:\d+\.?\d*|\.\d+))\s*(ms|s|m|h)?$/iu;
const CLOCK_SEPARATOR = ":";
const CLOCK_UNITS = [MILLISECONDS_PER_HOUR, MILLISECONDS_PER_MINUTE, MILLISECONDS_PER_SECOND] as const;
const NEGATIVE_SIGN = "-";
const AUTOMATIC_NAMES = new Set(["auto", "automatic"]);
const FOREVER_NAME = "forever";
const COUNT_PATTERN = /^(\d+(?:\.\d+)?)x$/iu;
const MIN_FONT_WEIGHT = 1;
const MAX_FONT_WEIGHT = 999;
const NUMBER_SEPARATOR = /[\s,]+/u;
const POINT_LENGTH = 2;
const SIZE_LENGTH = 2;
const RECT_LENGTH = 4;
const MATRIX_LENGTH = 6;
const VECTOR3_LENGTH = 3;
// WinRT's DateTime counts from 1601-01-01 UTC, JavaScript's Date from 1970.
const EPOCH_OFFSET_MILLISECONDS = 11_644_473_600_000;
const SVG_EXTENSION = ".svg";
const SVG_DATA_PREFIX = "data:image/svg+xml";
const URI_SUFFIX = /[?#].*$/u;
const PRESENTATION_NAMESPACE = "http://schemas.microsoft.com/winfx/2006/xaml/presentation";
const XML_ESCAPES = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ["\"", "&quot;"]
]);

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
  return [size, size, size, size] as const;
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
  const expanded = isShort ? digits.split("").map(digit => `${digit}${digit}`).join("") : digits;
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

function millisecondsOfClock(text: string) {
  const isNegative = text.startsWith(NEGATIVE_SIGN);
  const clock = isNegative ? text.slice(1) : text;
  const parts = clock.split(CLOCK_SEPARATOR).map(Number);
  const hasClockParts = parts.length >= 2 && parts.length <= CLOCK_UNITS.length;
  const isClock = hasClockParts && parts.every(part => Number.isFinite(part));
  if (!isClock) {
    throw new TypeError(`"${text}" is not a time span`);
  }

  let total = 0;
  for (const [iPart, part] of parts.entries()) {
    total += part * (CLOCK_UNITS[iPart] ?? 0);
  }

  return isNegative ? -total : total;
}

function millisecondsOf(text: string) {
  const trimmed = text.trim();
  const match = UNIT_PATTERN.exec(trimmed);
  const hasUnit = match !== null;
  if (!hasUnit) {
    return millisecondsOfClock(trimmed);
  }

  const [, amount = "", unit = DEFAULT_TIME_UNIT] = match;
  return Number(amount) * (MILLISECONDS_PER_UNIT.get(unit.toLowerCase()) ?? 1);
}

/** A time span input as WinRT ticks (100 ns); throws a `TypeError` for text that is not a time span. */
export function timeSpanTicks(input: number | string) {
  const isNumber = typeof input === "number";
  const milliseconds = isNumber ? input : millisecondsOf(input);
  const isMeasure = Number.isFinite(milliseconds);
  if (!isMeasure) {
    throw new TypeError(`${String(input)} is not a time span`);
  }

  return BigInt(Math.round(milliseconds * TICKS_PER_MILLISECOND));
}

/** WinRT ticks as milliseconds, the form a number input takes. */
export function ticksMilliseconds(ticks: bigint) {
  return Number(ticks) / TICKS_PER_MILLISECOND;
}

/** How a duration is measured: by its content, by a time span, or without end. */
export const DurationKind = {
  AUTOMATIC: "automatic",
  TIME_SPAN: "timeSpan",
  FOREVER: "forever"
} as const;

/** A duration kind: one of the `DurationKind` values. */
export type DurationKind = (typeof DurationKind)[keyof typeof DurationKind];

/** A duration input (not WinUI's own value) as its kind and, for a time span, its ticks. */
export function durationParts(input: number | string) {
  const isText = typeof input === "string";
  const name = isText ? input.trim().toLowerCase() : "";
  const isAutomatic = AUTOMATIC_NAMES.has(name);
  if (isAutomatic) {
    return {
      kind: DurationKind.AUTOMATIC,
      ticks: 0n
    };
  }

  const isForever = name === FOREVER_NAME;
  if (isForever) {
    return {
      kind: DurationKind.FOREVER,
      ticks: 0n
    };
  }

  return {
    kind: DurationKind.TIME_SPAN,
    ticks: timeSpanTicks(input)
  };
}

/** How a timeline repeats: a number of times, for a length of time, or without end. */
export const RepeatKind = {
  COUNT: "count",
  DURATION: "duration",
  FOREVER: "forever"
} as const;

/** A repeat kind: one of the `RepeatKind` values. */
export type RepeatKind = (typeof RepeatKind)[keyof typeof RepeatKind];

/** A repeat input (not WinUI's own value) as its kind, its count and, for a length of time, its ticks. */
export function repeatParts(input: number | string) {
  const isCount = typeof input === "number";
  if (isCount) {
    return {
      kind: RepeatKind.COUNT,
      count: input,
      ticks: 0n
    };
  }

  const text = input.trim();
  const isForever = text.toLowerCase() === FOREVER_NAME;
  if (isForever) {
    return {
      kind: RepeatKind.FOREVER,
      count: 0,
      ticks: 0n
    };
  }

  const [, times] = COUNT_PATTERN.exec(text) ?? [];
  const hasTimes = times !== undefined;
  if (hasTimes) {
    return {
      kind: RepeatKind.COUNT,
      count: Number(times),
      ticks: 0n
    };
  }

  return {
    kind: RepeatKind.DURATION,
    count: 0,
    ticks: timeSpanTicks(text)
  };
}

/** The weight a name, a number or numeric text stands for; throws a `RangeError` for any other. */
export function fontWeightNumber(input: number | string) {
  const isNumber = typeof input === "number";
  const wanted = isNumber ? input : input.trim().toLowerCase();
  const named = Object.entries(FONT_WEIGHTS).find(([name]) => name.toLowerCase() === wanted);
  const isNamed = named !== undefined;
  if (isNamed) {
    return named[1];
  }

  const weight = Number(wanted);
  const isWeight = Number.isInteger(weight) && weight >= MIN_FONT_WEIGHT && weight <= MAX_FONT_WEIGHT;
  if (!isWeight) {
    throw new RangeError(`${String(input)} is not a font weight (a name, or ${MIN_FONT_WEIGHT} to ${MAX_FONT_WEIGHT})`);
  }

  return weight;
}

function numbersOf(text: string) {
  const parts = text.trim().split(NUMBER_SEPARATOR);
  const numbers = parts.map(Number);
  const isEmpty = parts[0] === "";
  const isNumbers = !isEmpty && numbers.every(value => Number.isFinite(value));
  if (!isNumbers) {
    throw new TypeError(`"${text}" is not a list of numbers`);
  }

  return numbers;
}

// The numbers of an array or a text, when there are as many as the value has.
function fixedNumbers({ input, length, label }: {
  input: string | readonly number[];
  length: number;
  label: string;
}) {
  const isText = typeof input === "string";
  const numbers = isText ? numbersOf(input) : input;
  const isFixed = numbers.length === length;
  if (!isFixed) {
    throw new TypeError(`${isText ? input : `[${numbers.join(", ")}]`} is not ${label}`);
  }

  return numbers;
}

/** The x and y of a point input. */
export function pointCoordinates(input: PointInput) {
  const isObject = typeof input === "object" && "x" in input;
  if (isObject) {
    return [input.x, input.y] as const;
  }

  const [x = 0, y = 0] = fixedNumbers({
    input,
    length: POINT_LENGTH,
    label: "a point (x,y)"
  });
  return [x, y] as const;
}

/** The width and height of a size input. */
export function sizeDimensions(input: SizeInput) {
  const isObject = typeof input === "object" && "width" in input;
  if (isObject) {
    return [input.width, input.height] as const;
  }

  const [width = 0, height = 0] = fixedNumbers({
    input,
    length: SIZE_LENGTH,
    label: "a size (width,height)"
  });
  return [width, height] as const;
}

/** The x, y, width and height of a rect input. */
export function rectBounds(input: RectInput) {
  const isObject = typeof input === "object" && "width" in input;
  if (isObject) {
    return [input.x, input.y, input.width, input.height] as const;
  }

  const [x = 0, y = 0, width = 0, height = 0] = fixedNumbers({
    input,
    length: RECT_LENGTH,
    label: "a rect (x,y,width,height)"
  });
  return [x, y, width, height] as const;
}

/** The six cells of a matrix input: m11, m12, m21, m22, offsetX, offsetY. */
export function matrixCells(input: MatrixInput) {
  const isObject = typeof input === "object" && "m11" in input;
  if (isObject) {
    return [input.m11, input.m12, input.m21, input.m22, input.offsetX, input.offsetY] as const;
  }

  const [m11 = 0, m12 = 0, m21 = 0, m22 = 0, offsetX = 0, offsetY = 0] = fixedNumbers({
    input,
    length: MATRIX_LENGTH,
    label: "a matrix (m11,m12,m21,m22,offsetX,offsetY)"
  });
  return [m11, m12, m21, m22, offsetX, offsetY] as const;
}

/** The x, y and z of a vector input. */
export function vectorComponents(input: Vector3Input) {
  const isObject = typeof input === "object" && "z" in input;
  if (isObject) {
    return [input.x, input.y, input.z] as const;
  }

  const [x = 0, y = 0, depth = 0] = fixedNumbers({
    input,
    length: VECTOR3_LENGTH,
    label: "a vector (x,y,z)"
  });
  return [x, y, depth] as const;
}

/** A list of numbers input as an array. */
export function numberList(input: NumbersInput) {
  const isText = typeof input === "string";
  return isText ? numbersOf(input) : input;
}

/** A point list input as [x, y] pairs. */
export function pointList(input: PointListInput) {
  const isText = typeof input === "string";
  if (!isText) {
    return input.map(pointCoordinates);
  }

  const numbers = numbersOf(input);
  const isPairs = numbers.length % POINT_LENGTH === 0;
  if (!isPairs) {
    throw new TypeError(`"${input}" is not a list of points (x,y pairs)`);
  }

  const points: Array<readonly [number, number]> = [];
  for (let iNumber = 0; iNumber < numbers.length; iNumber += POINT_LENGTH) {
    points.push([numbers[iNumber] ?? 0, numbers[iNumber + 1] ?? 0]);
  }

  return points;
}

function millisecondsOfDate(input: Date | number | string) {
  const isDate = input instanceof Date;
  if (isDate) {
    return input.getTime();
  }

  const isText = typeof input === "string";
  return isText ? Date.parse(input) : input;
}

/** A date input as WinRT ticks (100 ns since 1601-01-01 UTC); throws a `TypeError` for a date that is not one. */
export function dateTicks(input: Date | number | string) {
  const milliseconds = millisecondsOfDate(input);
  const isMoment = Number.isFinite(milliseconds);
  if (!isMoment) {
    throw new TypeError(`${String(input)} is not a date`);
  }

  return (BigInt(Math.round(milliseconds)) + BigInt(EPOCH_OFFSET_MILLISECONDS)) * BigInt(TICKS_PER_MILLISECOND);
}

/** WinRT ticks since 1601-01-01 UTC as a `Date`, for a date WinUI hands to a handler. */
export function ticksDate(ticks: bigint) {
  return new Date(Number(ticks / BigInt(TICKS_PER_MILLISECOND)) - EPOCH_OFFSET_MILLISECONDS);
}

/** Whether a URI names an SVG image: an SVG data URI, or a path ending in `.svg`. */
export function isSvgUri(uri: string) {
  const text = uri.trim().toLowerCase();
  const isData = text.startsWith(SVG_DATA_PREFIX);
  return isData || text.replace(URI_SUFFIX, "").endsWith(SVG_EXTENSION);
}

/** The XAML of a Path with this mini-language data ("M0,0 L10,10"), for the reader that parses it into a geometry. */
export function pathMarkup(data: string) {
  const escaped = [...data].map(character => XML_ESCAPES.get(character) ?? character).join("");
  return `<Path xmlns="${PRESENTATION_NAMESPACE}" Data="${escaped}"/>`;
}
