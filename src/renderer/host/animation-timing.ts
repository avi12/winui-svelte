import type { Easing } from "#src/css/translate/easing.js";
import { LINEAR, parseEasing, stepLevels } from "#src/css/translate/easing.js";

const SOLVER_STEPS = 24;
const BEZIER_TERMS = 3;

const PlaybackDirection = {
  NORMAL: "normal",
  REVERSE: "reverse",
  ALTERNATE: "alternate",
  ALTERNATE_REVERSE: "alternate-reverse"
} as const;
/** One of the values of `PlaybackDirection`. */
export type PlaybackDirection = (typeof PlaybackDirection)[keyof typeof PlaybackDirection];

const FillMode = {
  NONE: "none",
  FORWARDS: "forwards",
  BACKWARDS: "backwards",
  BOTH: "both",
  AUTO: "auto"
} as const;
/** One of the values of `FillMode`. */
export type FillMode = (typeof FillMode)[keyof typeof FillMode];

/** What `element.animate(keyframes, options)` is told about time; every member has the web's default. */
export interface EffectTimingInput {
  readonly duration?: number | string;
  readonly delay?: number;
  readonly endDelay?: number;
  readonly iterations?: number;
  readonly direction?: PlaybackDirection;
  readonly easing?: string;
  readonly fill?: FillMode;
}

/** An animation's timing, resolved: numbers where the web allows `auto`. */
export interface EffectTiming {
  readonly duration: number;
  readonly delay: number;
  readonly endDelay: number;
  readonly iterations: number;
  readonly direction: PlaybackDirection;
  readonly easing: string;
  readonly fill: FillMode;
}

/**
 * Fills in the web's defaults and turns `auto` into a number.
 *
 * @param input - The options of `animate()`, or none.
 * @returns The timing the animation runs by.
 */
export function resolveTiming(input: EffectTimingInput = {}) {
  const duration = typeof input.duration === "number" ? input.duration : 0;
  return {
    duration,
    delay: input.delay ?? 0,
    endDelay: input.endDelay ?? 0,
    iterations: input.iterations ?? 1,
    direction: input.direction ?? PlaybackDirection.NORMAL,
    easing: input.easing ?? "linear",
    fill: input.fill ?? FillMode.AUTO
  } satisfies EffectTiming;
}

/** How long the iterations run, without the delays. */
function activeDuration(timing: EffectTiming) {
  return timing.duration * timing.iterations;
}

/** The time an animation finishes at, on its own timeline. */
export function endTime(timing: EffectTiming) {
  return Math.max(timing.delay + activeDuration(timing) + timing.endDelay, 0);
}

function bezierCoordinate({ first, second, position }: {
  first: number;
  second: number;
  position: number;
}) {
  const rest = 1 - position;
  const weighted = first * rest * rest * position + second * rest * position * position;
  return BEZIER_TERMS * weighted + position * position * position;
}

function solveBezier({ easing, progress }: {
  easing: Easing & { kind: "bezier" };
  progress: number;
}) {
  const { x1, y1, x2, y2 } = easing;
  let low = 0;
  let high = 1;
  for (let i = 0; i < SOLVER_STEPS; i++) {
    const middle = (low + high) / 2;
    const isBefore = bezierCoordinate({
      first: x1,
      second: x2,
      position: middle
    }) < progress;
    low = isBefore ? middle : low;
    high = isBefore ? high : middle;
  }

  return bezierCoordinate({
    first: y1,
    second: y2,
    position: (low + high) / 2
  });
}

function ease({ easing, progress }: {
  easing: Easing;
  progress: number;
}) {
  const isEdge = progress <= 0 || progress >= 1;
  if (isEdge) {
    return Math.min(Math.max(progress, 0), 1);
  }

  const isBezier = easing.kind === "bezier";
  if (isBezier) {
    return solveBezier({
      easing,
      progress
    });
  }

  const levels = stepLevels(easing);
  const iInterval = Math.min(Math.floor(progress * easing.count), easing.count - 1);
  return levels[iInterval] ?? 0;
}

function isReversed({ direction, iteration }: {
  direction: PlaybackDirection;
  iteration: number;
}) {
  const isOdd = iteration % 2 === 1;
  return direction === PlaybackDirection.REVERSE ||
    direction === PlaybackDirection.ALTERNATE && isOdd ||
    direction === PlaybackDirection.ALTERNATE_REVERSE && !isOdd;
}

function fillsBackwards(timing: EffectTiming) {
  return timing.fill === FillMode.BACKWARDS || timing.fill === FillMode.BOTH;
}

function fillsForwards(timing: EffectTiming) {
  return timing.fill === FillMode.FORWARDS || timing.fill === FillMode.BOTH;
}

/**
 * Where the keyframes are at a time on the animation's timeline: the
 * iteration's progress after direction and easing, as Web Animations works it
 * out.
 *
 * @param options - The timing, and the animation's current time.
 * @returns A fraction (0 is the first keyframe), or null when the effect has
 *   no say at that time (before the delay or after the end, with no fill).
 */
export function progressAt({ timing, time }: {
  timing: EffectTiming;
  time: number;
}) {
  const total = activeDuration(timing);
  const isBefore = time < timing.delay;
  const isAfter = time >= timing.delay + total;
  const isUnfilledBefore = isBefore && !fillsBackwards(timing);
  const isUnfilledAfter = isAfter && !fillsForwards(timing);
  const isInactive = isUnfilledBefore || isUnfilledAfter;
  if (isInactive) {
    return null;
  }

  const activeTime = Math.min(Math.max(time - timing.delay, 0), total);
  const overall = timing.duration > 0 ? activeTime / timing.duration : timing.iterations;
  const isWhole = overall === Math.floor(overall) && overall > 0 && activeTime === total;
  const iteration = isWhole ? overall - 1 : Math.floor(overall);
  const inIteration = isWhole ? 1 : overall - iteration;
  const directed = isReversed({
    direction: timing.direction,
    iteration
  }) ? 1 - inIteration : inIteration;
  return ease({
    easing: parseEasing(timing.easing) ?? LINEAR,
    progress: directed
  });
}
