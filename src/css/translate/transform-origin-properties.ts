import type { PropertyGroup } from "./property-kit.ts";
import { AXIS_SEPARATOR, DEFAULT_ORIGIN, ORIGIN_TARGET, pivotAbout } from "./transform-origin.ts";
import type { Reader } from "#src/css/parse/reader.js";
import { parseLength, parsePercent } from "#src/css/parse/values.js";

const MEMBER = "transform-origin";
const PERCENT_SCALE = 100;
const PERCENT_DIGITS = 4;
const MAX_ORIGIN_WORDS = 2;

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

/**
 * `transform-origin`: one or two positions (keywords, percentages, px) as the
 * `x,y` text the runtime resolves against the element's size, or null after an
 * error. Each coordinate is `N%` or `Npx`.
 */
function parseTransformOrigin(reader: Reader) {
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

/** The group of `transform-origin`, written for the runtime as the `origin` write. */
export function transformOriginProperty() {
  return {
    members: [MEMBER],
    lower(input) {
      const value = parseTransformOrigin(input.reading(MEMBER));
      return value === null ? [] : [{
        kind: "write",
        target: ORIGIN_TARGET,
        value
      } as const];
    },
    writes: {
      [ORIGIN_TARGET]: pivotAbout
    }
  } satisfies PropertyGroup;
}

/**
 * What WinUI's Scale and Rotation need that CSS does not say: they pivot about
 * CenterPoint, which is 0,0 (the top-left corner) until set, where CSS pivots at
 * the centre. An element that scales or rotates gets the centre, unless it names
 * a `transform-origin` (which its own group writes). The runtime resolves the
 * origin against the element's size.
 */
export function defaultOriginProperty() {
  return {
    members: ["scale", "rotate"],
    lower(input) {
      const hasOrigin = input.computed.has(MEMBER);
      return hasOrigin ? [] : [{
        kind: "write",
        target: ORIGIN_TARGET,
        value: DEFAULT_ORIGIN
      } as const];
    }
  } satisfies PropertyGroup;
}
