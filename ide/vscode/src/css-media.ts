import { splitTopLevel } from "./css-split.ts";

export const Theme = {
  LIGHT: "light",
  DARK: "dark"
} as const;
export type Theme = (typeof Theme)[keyof typeof Theme];

export interface MediaEnvironment {
  theme: Theme;
  isReducedMotion: boolean;
  width: number;
  height: number;
}

export interface MediaPart {
  text: string;
  matches: boolean | undefined;
  detail: string;
}

interface Comparison {
  name: string;
  operator: string;
  value: number;
}

const FEATURE = /^\(\s*(?<name>[a-z-]+)\s*(?::\s*(?<value>[^)]+?))?\s*\)$/iu;
const RANGE = /^\(\s*(?<left>[^<>=\s]+)\s*(?<first><=|>=|<|>|=)\s*(?<middle>[^<>=\s]+)\s*(?:(?<second><=|>=|<|>)\s*(?<right>[^<>=\s]+)\s*)?\)$/u;
const LENGTH = /^(-?\d*\.?\d+)px$/iu;
const LIMIT = /^(?<limit>min|max)-(?<name>width|height)$/u;
const SIZES = new Set(["width", "height"]);
const FLIPPED = new Map([
  ["<", ">"],
  ["<=", ">="],
  [">", "<"],
  [">=", "<="],
  ["=", "="]
]);
const MEDIA_TYPES = new Set(["all", "screen", "print"]);
const NEGATION = /^not\s/iu;
const MODIFIER = /^(?:not|only)\s+/iu;
const CONJUNCTION = /\s+and\s+/iu;

function lengthOf(word: string) {
  const match = LENGTH.exec(word);
  return match === null ? undefined : Number(match[1]);
}

function holds({ actual, operator, value }: {
  actual: number;
  operator: string;
  value: number;
}) {
  switch (operator) {
    case "<": return actual < value;
    case "<=": return actual <= value;
    case ">": return actual > value;
    case ">=": return actual >= value;
    default: return actual === value;
  }
}

function rangeComparisons(text: string) {
  const range = RANGE.exec(text)?.groups;
  const hasNoRange = range === undefined;
  if (hasNoRange) {
    return [];
  }

  const { left = "", first = "", middle = "", second, right } = range;
  if (SIZES.has(left)) {
    return [{
      name: left,
      operator: first,
      value: lengthOf(middle)
    }];
  }

  const chain = second === undefined ? [] : [{
    name: middle,
    operator: second,
    value: lengthOf(right ?? "")
  }];
  return [{
    name: middle,
    operator: FLIPPED.get(first) ?? first,
    value: lengthOf(left)
  }, ...chain];
}

function featureComparisons(text: string) {
  const feature = FEATURE.exec(text)?.groups;
  const name = feature?.["name"]?.toLowerCase() ?? "";
  const value = lengthOf(feature?.["value"]?.trim() ?? "");
  const limit = LIMIT.exec(name)?.groups;
  const hasLimit = limit !== undefined;
  if (hasLimit) {
    return [{
      name: limit["name"] ?? "",
      operator: limit["limit"] === "min" ? ">=" : "<=",
      value
    }];
  }

  return SIZES.has(name) ? [{
    name,
    operator: "=",
    value
  }] : [];
}

function isResolved(comparison: {
  name: string;
  operator: string;
  value: number | undefined;
}): comparison is Comparison {
  return comparison.value !== undefined;
}

function sizeOf({ name, environment }: {
  name: string;
  environment: MediaEnvironment;
}) {
  return name === "width" ? environment.width : environment.height;
}

function sizePart({ text, comparisons, environment }: {
  text: string;
  comparisons: Array<{
    name: string;
    operator: string;
    value: number | undefined;
  }>;
  environment: MediaEnvironment;
}) {
  const known = comparisons.filter(isResolved);
  const isReadable = known.length === comparisons.length;
  return {
    text,
    matches: isReadable ? known.every(comparison => holds({
      actual: sizeOf({
        name: comparison.name,
        environment
      }),
      operator: comparison.operator,
      value: comparison.value
    })) : undefined,
    detail: known.map(comparison => `${comparison.name} is ${sizeOf({
      name: comparison.name,
      environment
    })}px`).join(", ")
  } satisfies MediaPart;
}

function partOf({ text, environment }: {
  text: string;
  environment: MediaEnvironment;
}) {
  const feature = FEATURE.exec(text)?.groups;
  const name = feature?.["name"]?.toLowerCase();
  const value = feature?.["value"]?.trim().toLowerCase();
  const isPrefersColorScheme = name === "prefers-color-scheme";
  if (isPrefersColorScheme) {
    return {
      text,
      matches: value === environment.theme,
      detail: `the theme is ${environment.theme}`
    } satisfies MediaPart;
  }

  const isPrefersReducedMotion = name === "prefers-reduced-motion";
  if (isPrefersReducedMotion) {
    return {
      text,
      matches: (value === "reduce") === environment.isReducedMotion,
      detail: `reduced motion is ${environment.isReducedMotion ? "on" : "off"}`
    } satisfies MediaPart;
  }

  const comparisons = [...rangeComparisons(text), ...featureComparisons(text)];
  const hasComparisons = comparisons.length > 0;
  if (hasComparisons) {
    return sizePart({
      text,
      comparisons,
      environment
    });
  }

  const type = text.toLowerCase();
  const isType = MEDIA_TYPES.has(type);
  return {
    text,
    matches: isType ? type !== "print" : undefined,
    detail: isType ? "an app is a screen" : "not evaluated"
  } satisfies MediaPart;
}

function queryResult({ query, environment }: {
  query: string;
  environment: MediaEnvironment;
}) {
  const trimmed = query.trim();
  const isNegated = NEGATION.test(trimmed);
  const parts = trimmed.replace(MODIFIER, "").split(CONJUNCTION).map(text => partOf({
    text: text.trim(),
    environment
  }));
  const isUnknown = parts.some(part => part.matches === undefined);
  const isAll = parts.every(part => part.matches === true);
  return {
    parts,
    matches: isUnknown ? undefined : isAll !== isNegated
  };
}

function unknownOrNot(isUnknown: boolean) {
  return isUnknown ? undefined : false;
}

/**
 * Whether the condition of an `@media` rule holds in an assumed environment (never the OS), part by part: the
 * `prefers-color-scheme` and `prefers-reduced-motion` features, `width` and `height` as `min-` and `max-` features,
 * as `(width >= 600px)` ranges and as `(400px <= width <= 800px)` chains, and the media types. Queries joined by a
 * comma hold when any holds; a part it does not know leaves the isMatching undefined.
 */
export function evaluateMedia({ condition, environment }: {
  condition: string;
  environment: MediaEnvironment;
}) {
  const results = splitTopLevel({
    text: condition,
    separator: ","
  }).map(query => queryResult({
    query,
    environment
  }));
  const isAny = results.some(result => result.matches === true);
  const isUnknown = results.some(result => result.matches === undefined);
  return {
    matches: isAny ? true : unknownOrNot(isUnknown),
    parts: results.flatMap(result => result.parts)
  };
}

/**
 * The inlay text of an isMatching: `now: yes`, `now: no` or `now: unknown`.
 */
export function mediaLabel(isMatching: boolean | undefined) {
  const isUnknown = isMatching === undefined;
  if (isUnknown) {
    return "now: unknown";
  }

  return isMatching ? "now: yes" : "now: no";
}
