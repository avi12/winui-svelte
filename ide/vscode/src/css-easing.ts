import { closingIndex, splitTopLevel } from "./css-split.ts";

export const EasingKind = {
  BEZIER: "bezier",
  STEPS: "steps",
  LINEAR: "linear"
} as const;
export type EasingKind = (typeof EasingKind)[keyof typeof EasingKind];

export interface NamedEasing {
  name: string;
  kind: "bezier" | "steps";
  points?: number[] | undefined;
  count?: number | undefined;
  jump?: string | undefined;
}

export interface EasingCurve {
  text: string;
  start: number;
  end: number;
  samples: number[];
}

export interface Timing {
  name: string;
  durationMs: number;
  delayMs: number;
  easing: string;
}

export const SAMPLE_COUNT = 21;
const BEZIER_POINTS = 4;
const BEZIER_WEIGHT = 3;
const SOLVER_STEPS = 40;
const SAMPLE_DIGITS = 3;
const MILLISECONDS = 1000;
const PERCENT_DIVISOR = 100;
const FUNCTION = /(?<name>cubic-bezier|linear|steps)\(/iu;
const TIME = /^(-?\d*\.?\d+)(ms|s)$/iu;
const TIMING_PROPERTIES = new Set(["transition", "animation"]);
const EASING_PROPERTIES = new Set(["transition-timing-function", "animation-timing-function"]);
const KEYSPLINE = /^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s+(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/u;
const ANIMATION_WORDS = new Set([
  "infinite",
  "normal",
  "reverse",
  "alternate",
  "alternate-reverse",
  "forwards",
  "backwards",
  "both",
  "none",
  "running",
  "paused"
]);

function bezierAt({ parameter, first, second }: {
  parameter: number;
  first: number;
  second: number;
}) {
  const inverse = 1 - parameter;
  return BEZIER_WEIGHT * inverse * inverse * parameter * first
    + BEZIER_WEIGHT * inverse * parameter * parameter * second + parameter ** BEZIER_WEIGHT;
}

function bezierY({ points, progress }: {
  points: number[];
  progress: number;
}) {
  const [firstX = 0, firstY = 0, secondX = 0, secondY = 0] = points;
  let low = 0;
  let high = 1;
  for (let step = 0; step < SOLVER_STEPS; step += 1) {
    const middle = (low + high) / 2;
    const isBefore = bezierAt({
      parameter: middle,
      first: firstX,
      second: secondX
    }) < progress;
    low = isBefore ? middle : low;
    high = isBefore ? high : middle;
  }

  return bezierAt({
    parameter: (low + high) / 2,
    first: firstY,
    second: secondY
  });
}

function stepsY({ count, jump, progress }: {
  count: number;
  jump: string;
  progress: number;
}) {
  const isStart = jump === "start" || jump === "both";
  const isBoth = jump === "both";
  const isNone = jump === "none";
  const jumps = count + Number(isBoth) - Number(isNone);
  const raw = Math.floor(progress * count) + Number(isStart);
  const isEnd = progress >= 1;
  return Math.min(isEnd ? jumps : raw, jumps) / jumps;
}

function linearY({ stops, progress }: {
  stops: Array<{
    position: number;
    value: number;
  }>;
  progress: number;
}) {
  const after = stops.findIndex(stop => stop.position >= progress);
  const next = stops[after];
  const previous = stops[after - 1];
  const hasNoNext = next === undefined;
  if (hasNoNext) {
    return stops.at(-1)?.value ?? 1;
  }

  const hasNoPrevious = previous === undefined;
  if (hasNoPrevious) {
    return next.value;
  }

  const span = next.position - previous.position;
  const rise = (next.value - previous.value) * (progress - previous.position);
  return span <= 0 ? next.value : previous.value + rise / span;
}

function linearStops(argumentsText: string) {
  const items = splitTopLevel({
    text: argumentsText,
    separator: ","
  }).flatMap(item => {
    const [value, ...positions] = item.split(/\s+/u);
    const number = Number(value);
    return Number.isNaN(number) ? [] : [{
      value: number,
      positions: positions.map(word => Number.parseFloat(word) / PERCENT_DIVISOR)
    }];
  });
  const last = items.length - 1;
  const stops: Array<{
    position: number;
    value: number;
  }> = [];
  for (const [i, item] of items.entries()) {
    const fallback = last === 0 ? 1 : i / last;
    const position = item.positions[0] ?? fallback;
    stops.push({
      position: Math.max(position, stops.at(-1)?.position ?? 0),
      value: item.value
    });
    const second = item.positions[1];
    const hasSecond = second !== undefined;
    if (hasSecond) {
      stops.push({
        position: second,
        value: item.value
      });
    }
  }

  return stops;
}

function sampled(valueAt: (progress: number) => number) {
  return Array.from({ length: SAMPLE_COUNT }, (_, i) => Number(valueAt(i / (SAMPLE_COUNT - 1)).toFixed(SAMPLE_DIGITS)));
}

function numbersOf(argumentsText: string) {
  return splitTopLevel({
    text: argumentsText,
    separator: ","
  }).map(Number);
}

function functionSamples({ name, argumentsText }: {
  name: string;
  argumentsText: string;
}) {
  const isCubicBezier = name === "cubic-bezier";
  if (isCubicBezier) {
    const points = numbersOf(argumentsText);
    const isValid = points.length === BEZIER_POINTS && points.every(point => !Number.isNaN(point));
    return isValid ? sampled(progress => bezierY({
      points,
      progress
    })) : undefined;
  }

  const isSteps = name === "steps";
  if (isSteps) {
    const [countText = "", jump = "end"] = splitTopLevel({
      text: argumentsText,
      separator: ","
    });
    const count = Number(countText);
    const isValid = Number.isInteger(count) && count > 0;
    return isValid ? sampled(progress => stepsY({
      count,
      jump: jump.replace("jump-", ""),
      progress
    })) : undefined;
  }

  const stops = linearStops(argumentsText);
  return stops.length > 0 ? sampled(progress => linearY({
    stops,
    progress
  })) : undefined;
}

function namedSamples({ word, named }: {
  word: string;
  named: readonly NamedEasing[];
}) {
  const easing = named.find(candidate => candidate.name === word.toLowerCase());
  const points = easing?.points;
  const isBezier = easing?.kind === "bezier" && points !== undefined;
  if (isBezier) {
    return sampled(progress => bezierY({
      points,
      progress
    }));
  }

  return easing?.kind === "steps" ? sampled(progress => stepsY({
    count: easing.count ?? 1,
    jump: easing.jump ?? "end",
    progress
  })) : undefined;
}

/**
 * The easing written in a value as the curve it draws (21 samples of progress against time): a
 * `cubic-bezier()`, `steps()` or `linear()` function, or a named easing from the data set (`ease-in-out`). Only
 * the first one of the value is read; its range in the value comes with it.
 */
export function easingOf({ value, named }: {
  value: string;
  named: readonly NamedEasing[];
}) {
  const match = FUNCTION.exec(value);
  const hasMatch = match !== null;
  if (hasMatch) {
    const open = match.index + match[0].length - 1;
    const end = closingIndex({
      text: value,
      open
    });
    const samples = end === -1 ? undefined : functionSamples({
      name: (match.groups?.["name"] ?? "").toLowerCase(),
      argumentsText: value.slice(open + 1, end - 1)
    });
    return samples === undefined ? undefined : {
      text: value.slice(match.index, end),
      start: match.index,
      end,
      samples
    } satisfies EasingCurve;
  }

  let offset = 0;
  for (const word of value.split(/(\s+)/u)) {
    const samples = namedSamples({
      word,
      named
    });
    const hasSamples = samples !== undefined;
    if (hasSamples) {
      return {
        text: word,
        start: offset,
        end: offset + word.length,
        samples
      } satisfies EasingCurve;
    }

    offset += word.length;
  }

  return undefined;
}

/**
 * The curve of a `KeySpline` value (`0.1,0.9 0.2,1`), or undefined when it is not four numbers.
 */
export function keySplineOf(value: string) {
  const points = KEYSPLINE.exec(value)?.slice(1).map(Number);
  return points === undefined ? undefined : sampled(progress => bezierY({
    points,
    progress
  }));
}

function millisecondsOf(word: string) {
  const match = TIME.exec(word);
  const isTime = match !== null;
  if (!isTime) {
    return undefined;
  }

  return Number(match[1]) * (match[2]?.toLowerCase() === "s" ? MILLISECONDS : 1);
}

function isTimingName({ word, easing }: {
  word: string;
  easing: string | undefined;
}) {
  const isOther = millisecondsOf(word) !== undefined || word === easing;
  return !isOther && !ANIMATION_WORDS.has(word) && Number.isNaN(Number(word));
}

function timingOf({ item, named, isAnimation }: {
  item: string;
  named: readonly NamedEasing[];
  isAnimation: boolean;
}) {
  const words = splitTopLevel({
    text: item,
    separator: " "
  });
  const times = words.map(millisecondsOf).filter(time => time !== undefined);
  const easing = words.find(word => namedSamples({
    word,
    named
  }) !== undefined || FUNCTION.test(word));
  const name = words.find(word => isTimingName({
    word,
    easing
  }));
  const [durationMs, delayMs = 0] = times;
  return durationMs === undefined ? [] : [{
    name: name ?? (isAnimation ? "" : "all"),
    durationMs,
    delayMs,
    easing: easing ?? "ease"
  } satisfies Timing];
}

/**
 * The timings a `transition` or `animation` value sets, one per comma: what it plays, for how long, after how
 * long, with which easing. The first time of an item is its duration and the second its delay.
 */
export function timingsOf({ property, value, named }: {
  property: string;
  value: string;
  named: readonly NamedEasing[];
}) {
  const isTiming = TIMING_PROPERTIES.has(property);
  if (!isTiming) {
    return [];
  }

  return splitTopLevel({
    text: value,
    separator: ","
  }).flatMap(item => timingOf({
    item,
    named,
    isAnimation: property === "animation"
  }));
}

/**
 * Whether a property writes an easing: the shorthands, and the timing-function longhands.
 */
export function isEasingProperty(property: string) {
  return TIMING_PROPERTIES.has(property) || EASING_PROPERTIES.has(property);
}
