import { parseNumber, splitCommas } from "#src/css/parse/values.js";

// Where a `steps()` easing jumps within each interval.
const StepJump = {
  START: "start",
  END: "end",
  NONE: "none",
  BOTH: "both"
} as const;

type StepJump = (typeof StepJump)[keyof typeof StepJump];

/** A `cubic-bezier()` timing function: WinUI's KeySpline takes its two control points. */
export interface BezierEasing {
  kind: "bezier";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A `steps()` timing function: WinUI has discrete key frames, one per step. */
export interface StepsEasing {
  kind: "steps";
  count: number;
  jump: StepJump;
}

/** A CSS timing function, as data. */
export type Easing = BezierEasing | StepsEasing;

const STEPS_PATTERN = /^steps\((.*)\)$/isu;
const BEZIER_PATTERN = /^cubic-bezier\((.*)\)$/isu;
const BEZIER_ARGUMENTS = 4;
const MAX_STEP_ARGUMENTS = 2;
const MIN_NONE_STEPS = 2;
const JUMP_TERMS = new Map<string, StepJump>([
  ["start", StepJump.START],
  ["jump-start", StepJump.START],
  ["end", StepJump.END],
  ["jump-end", StepJump.END],
  ["jump-none", StepJump.NONE],
  ["jump-both", StepJump.BOTH]
]);

function bezier(values: readonly [number, number, number, number]) {
  const [firstX, firstY, secondX, secondY] = values;
  return {
    kind: "bezier",
    x1: firstX,
    y1: firstY,
    x2: secondX,
    y2: secondY
  } satisfies BezierEasing;
}

/** CSS's `linear`. */
export const LINEAR = bezier([0, 0, 1, 1]);

// The keywords that are cubic-bezier() in CSS's own spelling, read as that.
const BEZIER_KEYWORDS = new Map([
  ["ease", "0.25, 0.1, 0.25, 1"],
  ["ease-in", "0.42, 0, 1, 1"],
  ["ease-out", "0, 0, 0.58, 1"],
  ["ease-in-out", "0.42, 0, 0.58, 1"]
]);
const STEP_KEYWORDS = new Map<string, StepJump>([
  ["step-start", StepJump.START],
  ["step-end", StepJump.END]
]);

function parseBezier(argumentsText: string) {
  const numbers = splitCommas(argumentsText).map(argument => parseNumber(argument.trim()));
  const values = numbers.filter(value => value !== null);
  const [startX = 0, startY = 0, endX = 0, endY = 0] = values;
  const isComplete = numbers.length === BEZIER_ARGUMENTS && values.length === BEZIER_ARGUMENTS;
  const isXInRange = isComplete && startX >= 0 && startX <= 1 && endX >= 0 && endX <= 1;
  return isXInRange ? bezier([startX, startY, endX, endY]) : null;
}

function parseSteps(argumentsText: string) {
  const items = splitCommas(argumentsText).map(argument => argument.trim());
  const [countText = "", jumpText] = items;
  const count = parseNumber(countText);
  const jump = jumpText === undefined ? StepJump.END : JUMP_TERMS.get(jumpText.toLowerCase());
  const minimum = jump === StepJump.NONE ? MIN_NONE_STEPS : 1;
  const isCountValid = count !== null && Number.isInteger(count) && count >= minimum;
  const isStepsRead = isCountValid && jump !== undefined && items.length <= MAX_STEP_ARGUMENTS;
  return isStepsRead ? {
    kind: "steps",
    count,
    jump
  } satisfies StepsEasing : null;
}

/** A timing function (a keyword, `cubic-bezier()` or `steps()`), or null when it is none of them. */
export function parseEasing(text: string) {
  const lower = text.trim().toLowerCase();
  const isLinearKeyword = lower === "linear";
  if (isLinearKeyword) {
    return LINEAR;
  }

  const keywordArguments = BEZIER_KEYWORDS.get(lower);
  const stepJump = STEP_KEYWORDS.get(lower);
  const bezierArguments = BEZIER_PATTERN.exec(lower)?.[1] ?? keywordArguments;
  const hasBezier = bezierArguments !== undefined;
  if (hasBezier) {
    return parseBezier(bezierArguments);
  }

  const hasStepKeyword = stepJump !== undefined;
  if (hasStepKeyword) {
    return {
      kind: "steps",
      count: 1,
      jump: stepJump
    } satisfies StepsEasing;
  }

  const stepsArguments = STEPS_PATTERN.exec(lower)?.[1];
  return stepsArguments === undefined ? null : parseSteps(stepsArguments);
}

const STEP_MIRROR = new Map<StepJump, StepJump>([
  [StepJump.START, StepJump.END],
  [StepJump.END, StepJump.START],
  [StepJump.NONE, StepJump.NONE],
  [StepJump.BOTH, StepJump.BOTH]
]);

/** The easing of the same interval played backwards, as a reversed animation direction asks. */
export function mirrorEasing(easing: Easing) {
  const isSteps = easing.kind === "steps";
  if (isSteps) {
    return {
      ...easing,
      jump: STEP_MIRROR.get(easing.jump) ?? easing.jump
    } satisfies StepsEasing;
  }

  return bezier([1 - easing.x2, 1 - easing.y2, 1 - easing.x1, 1 - easing.y1]);
}

/** Whether the easing is the straight line, which needs no KeySpline. */
export function isLinear(easing: Easing) {
  const isStraight = easing.kind === "bezier" && easing.x1 === 0 && easing.y1 === 0 && easing.x2 === 1 && easing.y2 === 1;
  return isStraight;
}

/**
 * The output of a `steps()` easing in each of its intervals, as fractions of the
 * way from the first value to the last: what the discrete key frames hold.
 */
export function stepLevels(easing: StepsEasing) {
  const { count, jump } = easing;
  const level = new Map<StepJump, (i: number) => number>([
    [StepJump.START, i => (i + 1) / count],
    [StepJump.NONE, i => i / (count - 1)],
    [StepJump.BOTH, i => (i + 1) / (count + 1)],
    [StepJump.END, i => i / count]
  ]).get(jump);
  return Array.from({ length: count }, (_, i) => level?.(i) ?? 0);
}
