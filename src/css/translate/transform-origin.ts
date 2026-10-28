import type { Reader } from "#src/css/parse/reader.js";
import { parseLength, parsePercent } from "#src/css/parse/values.js";

const AXIS_SEPARATOR = ",";
const PERCENT_SCALE = 100;
const PERCENT_DIGITS = 4;
const MAX_ORIGIN_WORDS = 2;

/** CSS's default `transform-origin`: the element's centre. */
export const DEFAULT_ORIGIN = "50%,50%";

const Axis = {
  HORIZONTAL: "horizontal",
  VERTICAL: "vertical",
  BOTH: "both"
} as const;
type Axis = (typeof Axis)[keyof typeof Axis];

const KEYWORDS = new Map<string, {
  axis: Axis;
  percent: number;
}>([
  ["left", {
    axis: Axis.HORIZONTAL,
    percent: 0
  }],
  ["right", {
    axis: Axis.HORIZONTAL,
    percent: PERCENT_SCALE
  }],
  ["top", {
    axis: Axis.VERTICAL,
    percent: 0
  }],
  ["bottom", {
    axis: Axis.VERTICAL,
    percent: PERCENT_SCALE
  }],
  ["center", {
    axis: Axis.BOTH,
    percent: PERCENT_SCALE / 2
  }]
]);

function percentText(percent: number) {
  return `${Number(percent.toFixed(PERCENT_DIGITS))}%`;
}

// One coordinate: a percentage of the size ("25%") or pixels ("12px").
function coordinate(word: string) {
  const keyword = KEYWORDS.get(word.toLowerCase());
  const hasKeyword = keyword !== undefined;
  if (hasKeyword) {
    return percentText(keyword.percent);
  }

  const fraction = parsePercent(word);
  const isPercent = fraction !== null;
  if (isPercent) {
    return percentText(fraction * PERCENT_SCALE);
  }

  const pixels = parseLength(word);
  return pixels === null ? null : `${pixels}px`;
}

function axisOf(word: string) {
  return KEYWORDS.get(word.toLowerCase())?.axis ?? Axis.BOTH;
}

// CSS lets keywords come in either order: "top left" is "left top".
function inCssOrder([first, second]: [string, string]) {
  const isSwapped = axisOf(first) === Axis.VERTICAL || axisOf(second) === Axis.HORIZONTAL;
  return isSwapped ? [second, first] as const : [first, second] as const;
}

// A single keyword names one axis and leaves the other centred.
function withCentre(word: string) {
  const axis = axisOf(word);
  return axis === Axis.VERTICAL ? ["center", word] as const : [word, "center"] as const;
}

/** A point in an element, in device-independent pixels from its top-left corner. */
export interface OriginPoint {
  x: number;
  y: number;
}

/**
 * `transform-origin`: one or two positions (keywords, percentages, px) as the
 * `x,y` text the runtime resolves against the element's size, or null after an
 * error. Each coordinate is `N%` or `Npx`.
 */
export function parseTransformOrigin(reader: Reader) {
  const words = reader.words;
  const isCountValid = words.length >= 1 && words.length <= MAX_ORIGIN_WORDS;
  if (!isCountValid) {
    return reader.expected("one or two positions (left, center, 25%, 12px...)");
  }

  const [first = "", second] = words;
  const pair = second === undefined ? withCentre(first) : inCssOrder([first, second]);
  const horizontal = coordinate(pair[0]);
  const vertical = coordinate(pair[1]);
  const isMisplaced = axisOf(pair[0]) === Axis.VERTICAL || axisOf(pair[1]) === Axis.HORIZONTAL;
  const isInvalid = horizontal === null || vertical === null || isMisplaced;
  if (isInvalid) {
    return reader.expected("positions such as left, center, 25% or 12px (a horizontal one, then a vertical one)");
  }

  return `${horizontal}${AXIS_SEPARATOR}${vertical}`;
}

function resolveCoordinate({ text, size }: {
  text: string;
  size: number;
}) {
  const amount = Number.parseFloat(text);
  const isPercent = text.endsWith("%");
  return isPercent ? amount / PERCENT_SCALE * size : amount;
}

/**
 * The point `value` (as `parseTransformOrigin` wrote it) names in an element of
 * this size, in device-independent pixels from its top-left corner.
 */
export function resolveTransformOrigin({ value, width, height }: {
  value: string;
  width: number;
  height: number;
}) {
  const [horizontal = "50%", vertical = "50%"] = value.split(AXIS_SEPARATOR);
  return {
    x: resolveCoordinate({
      text: horizontal,
      size: width
    }),
    y: resolveCoordinate({
      text: vertical,
      size: height
    })
  };
}
