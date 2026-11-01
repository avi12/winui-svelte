import { parseEasing } from "./easing.ts";
import { DISPLAY_KEYWORDS } from "./layout-properties.ts";
import type { Declaration, Keyframes, KeyframeStep, SourcePosition } from "./types.ts";
import { visibilities } from "./visual-properties.ts";
import { parseDegrees } from "#src/css/parse/angles.js";
import { parseColor } from "#src/css/parse/colors.js";
import { NOTATIONS } from "#src/css/parse/notation.js";
import { parseLength, parseNumber, splitCommas, splitWords } from "#src/css/parse/values.js";

/** The kinds of value WinUI animates: a Double, a Color of a brush, or a Visibility, which steps. */
export const TrackKind = {
  DOUBLE: "double",
  COLOR: "color",
  VISIBILITY: "visibility"
} as const;

/** One of the kinds in `TrackKind`. */
export type TrackKind = (typeof TrackKind)[keyof typeof TrackKind];

/** One value of a track at an offset of the animation, with the easing it starts. */
export interface TrackFrame {
  offset: number;
  /** A number for a Double, `#AARRGGBB` for a Color, `Visible` or `Collapsed` for a Visibility. */
  value: number | string;
  /** The `animation-timing-function` the keyframe itself set, or null for the animation's. */
  easing: string | null;
}

/** One WinUI property an animation drives, with the keyframes that set it. */
export interface Track {
  /** The `Storyboard.TargetProperty` path. */
  target: string;
  kind: TrackKind;
  frames: TrackFrame[];
  /** For a color, the brush property of the element that must be a brush of its own to animate. */
  brush: string | null;
  /** Whether the path goes through the element's RenderTransform, which must be a CompositeTransform. */
  isTransform: boolean;
}

interface TrackValue {
  key: string;
  target: string;
  kind: TrackKind;
  value: number | string;
  brush?: string;
  isTransform?: boolean;
}

type Report = (input: {
  message: string;
  at: SourcePosition;
}) => void;

const TIMING_FUNCTION = "animation-timing-function";
const FUNCTION = /^([a-z][a-z0-9]*)\((.*)\)$/isu;
const ANIMATED = "WinUI animates opacity, width, height, colors, translate, scale, rotate, transform, display and visibility";
const VISIBLE = "Visible";
const COLLAPSED = "Collapsed";
const TRANSFORM_PREFIX = "(UIElement.RenderTransform).(CompositeTransform.";
const SCALE_PREFIX = "Scale";
const IDENTITY = new Map<string, number>([
  ["TranslateX", 0],
  ["TranslateY", 0],
  ["ScaleX", 1],
  ["ScaleY", 1],
  ["Rotation", 0],
  ["SkewX", 0],
  ["SkewY", 0]
]);
const COLOR_TARGETS = new Map([
  ["background-color", {
    target: "Background",
    brush: "background"
  }],
  ["color", {
    target: "Foreground",
    brush: "foreground"
  }],
  ["border-color", {
    target: "BorderBrush",
    brush: "borderBrush"
  }]
]);
const NO_POSITION: SourcePosition = {
  line: 1,
  column: 1
};

/** Reports a problem with a keyframe declaration and gives null. */
type Fail = (message: string) => null;

interface Reading {
  declaration: Declaration;
  fail: Fail;
}

function doubleValue({ key, target, value }: {
  key: string;
  target: string;
  value: number;
}) {
  return {
    key,
    target,
    kind: TrackKind.DOUBLE,
    value
  } satisfies TrackValue;
}

function component({ name, value }: {
  name: string;
  value: number;
}) {
  return {
    ...doubleValue({
      key: name,
      target: `${TRANSFORM_PREFIX}${name})`,
      value
    }),
    isTransform: true
  } satisfies TrackValue;
}

type Contribution = ReadonlyArray<readonly [string, number]>;

// What each function of a transform list contributes to the components of the
// CompositeTransform; two functions of one axis add (scales multiply) as CSS would.
const TRANSFORM_FUNCTIONS = new Map<string, {
  kind: "length" | "number" | "angle";
  max: number;
  contribute(values: number[]): Contribution;
}>([
  ["translate", {
    kind: "length",
    max: 2,
    contribute: ([x = 0, y = 0]) => [["TranslateX", x], ["TranslateY", y]]
  }],
  ["translatex", {
    kind: "length",
    max: 1,
    contribute: ([x = 0]) => [["TranslateX", x]]
  }],
  ["translatey", {
    kind: "length",
    max: 1,
    contribute: ([y = 0]) => [["TranslateY", y]]
  }],
  ["scale", {
    kind: "number",
    max: 2,
    contribute: ([x = 1, y = x]) => [["ScaleX", x], ["ScaleY", y]]
  }],
  ["scalex", {
    kind: "number",
    max: 1,
    contribute: ([x = 1]) => [["ScaleX", x]]
  }],
  ["scaley", {
    kind: "number",
    max: 1,
    contribute: ([y = 1]) => [["ScaleY", y]]
  }],
  ["rotate", {
    kind: "angle",
    max: 1,
    contribute: ([angle = 0]) => [["Rotation", angle]]
  }],
  ["rotatez", {
    kind: "angle",
    max: 1,
    contribute: ([angle = 0]) => [["Rotation", angle]]
  }],
  ["skew", {
    kind: "angle",
    max: 2,
    contribute: ([x = 0, y = 0]) => [["SkewX", x], ["SkewY", y]]
  }],
  ["skewx", {
    kind: "angle",
    max: 1,
    contribute: ([x = 0]) => [["SkewX", x]]
  }],
  ["skewy", {
    kind: "angle",
    max: 1,
    contribute: ([y = 0]) => [["SkewY", y]]
  }]
]);

const ARGUMENT_PARSERS = {
  length: parseLength,
  number: parseNumber,
  angle: parseDegrees
} as const;

function combined({ name, before, amount }: {
  name: string;
  before: number | undefined;
  amount: number;
}) {
  const isScale = name.startsWith(SCALE_PREFIX);
  return isScale ? (before ?? 1) * amount : (before ?? 0) + amount;
}

// The components a `transform` list sets, or null after reporting why it cannot be animated.
function transformValues({ declaration, fail }: Reading) {
  const words = splitWords(declaration.value);
  const isNone = words.length === 1 && words[0]?.toLowerCase() === "none";
  if (isNone) {
    return [...IDENTITY].map(([name, value]) => component({
      name,
      value
    }));
  }

  const state = new Map<string, number>();
  for (const word of words) {
    const call = FUNCTION.exec(word);
    const spec = TRANSFORM_FUNCTIONS.get((call?.[1] ?? "").toLowerCase());
    const args = splitCommas(call?.[2] ?? "").map(argument => argument.trim());
    const parse = spec === undefined ? null : ARGUMENT_PARSERS[spec.kind];
    const values = parse === null ? [] : args.map(parse);
    const isReadable = spec !== undefined && args.length <= spec.max && !values.includes(null);
    if (!isReadable) {
      return fail(`transform: ${word} cannot be animated (a CompositeTransform animates translate(), scale(), rotate() and skew(), in px, numbers and deg)`);
    }

    for (const [name, amount] of spec.contribute(values.filter(value => value !== null))) {
      state.set(
        name, combined({
          name,
          before: state.get(name),
          amount
        })
      );
    }
  }

  return [...state].map(([name, value]) => component({
    name,
    value
  }));
}

// `translate` and `scale`: one or two numbers for the X and Y components; a
// missing second is 0 for a translation and the first for a scale.
function pairValues({ reading, names, parse, missing }: {
  reading: Reading;
  names: readonly [string, string];
  parse(token: string): number | null;
  missing(first: number): number;
}) {
  const { declaration, fail } = reading;
  const parsed = splitWords(declaration.value).map(parse);
  const numbers = parsed.filter(value => value !== null);
  const isValid = numbers.length === parsed.length && parsed.length >= 1 && parsed.length <= names.length;
  if (!isValid) {
    return fail(`${declaration.property}: expected one or two values, found "${declaration.value}"`);
  }

  const [first = 0, second = missing(first)] = numbers;
  return [first, second].map((value, i) => component({
    name: names[i] ?? "",
    value
  }));
}

function rotationValues({ declaration, fail }: Reading) {
  const degrees = parseDegrees(declaration.value.trim());
  const isAngle = degrees !== null;
  return isAngle ? [component({
    name: "Rotation",
    value: degrees
  })] : fail(`rotate: expected an angle, found "${declaration.value}"`);
}

function opacityValues({ declaration, fail }: Reading) {
  const word = declaration.value.trim();
  const amount = parseNumber(word);
  const isAmount = amount !== null;
  return isAmount ? [doubleValue({
    key: "Opacity",
    target: "Opacity",
    value: amount
  })] : fail(`opacity: expected a number, found "${word}": ${NOTATIONS.alpha.advice}`);
}

function sizeValues({ target, reading }: {
  target: string;
  reading: Reading;
}) {
  const { declaration, fail } = reading;
  const word = declaration.value.trim();
  const pixels = parseLength(word);
  const isLength = pixels !== null;
  return isLength ? [doubleValue({
    key: target,
    target,
    value: pixels
  })] : fail(`${declaration.property}: expected a length in px, found "${word}"`);
}

function colorValues({ declaration, fail }: Reading) {
  const spec = COLOR_TARGETS.get(declaration.property);
  const color = parseColor(declaration.value.trim());
  const isReadable = spec !== undefined && color !== null;
  if (!isReadable) {
    return fail(`${declaration.property}: a keyframe color must be written out (hex, rgb(), a name), not "${declaration.value}"`);
  }

  return [{
    key: spec.target,
    target: `${spec.target}.(SolidColorBrush.Color)`,
    kind: TrackKind.COLOR,
    value: color,
    brush: spec.brush
  } satisfies TrackValue];
}

function displayVisibility(word: string) {
  const isKnown = DISPLAY_KEYWORDS.has(word);
  if (!isKnown) {
    return undefined;
  }

  return word === "none" ? COLLAPSED : VISIBLE;
}

/** The Visibility a `display` or `visibility` keyword stands for, or undefined for a word that is neither. */
export function visibilityOf({ property, word }: {
  property: string;
  word: string;
}) {
  const lower = word.trim().toLowerCase();
  return property === "display" ? displayVisibility(lower) : visibilities.get(lower);
}

// `display` and `visibility` both drive Visibility, which WinUI cannot blend: it steps.
function visibilityValues({ declaration, fail }: Reading) {
  const isDisplay = declaration.property === "display";
  const value = visibilityOf({
    property: declaration.property,
    word: declaration.value
  });
  const isReadable = value !== undefined;
  return isReadable ? [{
    key: "Visibility",
    target: "Visibility",
    kind: TrackKind.VISIBILITY,
    value
  } satisfies TrackValue] : fail(`${declaration.property}: expected a ${isDisplay ? "display" : "visibility"} keyword, found "${declaration.value}"`);
}

// Each animatable property and how its value becomes WinUI values.
const VALUES = new Map<string, (reading: Reading) => TrackValue[] | null>([
  ["opacity", opacityValues],
  ["display", visibilityValues],
  ["visibility", visibilityValues],
  ["width", reading => sizeValues({
    target: "Width",
    reading
  })],
  ["height", reading => sizeValues({
    target: "Height",
    reading
  })],
  ["transform", transformValues],
  ["translate", reading => pairValues({
    reading,
    names: ["TranslateX", "TranslateY"],
    parse: parseLength,
    missing: () => 0
  })],
  ["scale", reading => pairValues({
    reading,
    names: ["ScaleX", "ScaleY"],
    parse: parseNumber,
    missing: first => first
  })],
  ["rotate", rotationValues],
  ["background-color", colorValues],
  ["color", colorValues],
  ["border-color", colorValues]
]);

function trackOf({ tracks, entry }: {
  tracks: Map<string, Track>;
  entry: TrackValue;
}) {
  const track = tracks.get(entry.key) ?? {
    target: entry.target,
    kind: entry.kind,
    frames: [],
    brush: entry.brush ?? null,
    isTransform: entry.isTransform ?? false
  } satisfies Track;
  tracks.set(entry.key, track);
  return track;
}

// The values one declaration of a keyframe sets, or null after reporting why it cannot.
function declarationValues({ declaration, keyframes, report }: {
  declaration: Declaration;
  keyframes: Keyframes;
  report: Report;
}) {
  const read = VALUES.get(declaration.property);
  function fail(message: string) {
    report({
      message: `@keyframes ${keyframes.name}: ${message}`,
      at: declaration.at
    });
    return null;
  }

  return read === undefined ? fail(`${declaration.property} cannot be animated (${ANIMATED})`) : read({
    declaration,
    fail
  });
}

// Adds one keyframe's values to the tracks; false after a fault.
function addStep({ keyframes, step, tracks, report }: {
  keyframes: Keyframes;
  step: KeyframeStep;
  tracks: Map<string, Track>;
  report: Report;
}) {
  const timing = step.declarations.findLast(declaration => declaration.property === TIMING_FUNCTION);
  const easing = timing?.value ?? null;
  const isEasingInvalid = easing !== null && parseEasing(easing) === null;
  if (isEasingInvalid) {
    report({
      message: `${TIMING_FUNCTION}: expected a timing function, found "${easing}"`,
      at: timing?.at ?? NO_POSITION
    });
  }

  let isValid = !isEasingInvalid;
  for (const declaration of step.declarations.filter(each => each.property !== TIMING_FUNCTION)) {
    const values = declarationValues({
      declaration,
      keyframes,
      report
    });
    isValid &&= values !== null;
    for (const entry of values ?? []) {
      const track = trackOf({
        tracks,
        entry
      });
      track.frames = track.frames.filter(frame => frame.offset !== step.offset);
      track.frames.push({
        offset: step.offset,
        value: entry.value,
        easing
      });
    }
  }

  return isValid;
}

// As CSS steps display and visibility: the visible value holds through an interval that has it at either end, so
// a hide lands at the end of the fade and a show at its start.
function showBeforeAppearing(track: Track) {
  for (const [i, frame] of track.frames.entries()) {
    const isBeforeVisible = track.frames[i + 1]?.value === VISIBLE;
    if (isBeforeVisible) {
      frame.value = VISIBLE;
    }
  }
}

/**
 * The WinUI properties an `@keyframes` rule drives, each with its values at the
 * offsets that set it. Every keyframe property WinUI cannot animate is reported
 * through `report`, with the position of its declaration; the result is null then.
 */
export function tracksOf({ keyframes, report }: {
  keyframes: Keyframes;
  report: Report;
}) {
  const tracks = new Map<string, Track>();
  const results = keyframes.steps.map(step => addStep({
    keyframes,
    step,
    tracks,
    report
  }));
  for (const track of tracks.values()) {
    track.frames.sort((first, second) => first.offset - second.offset);
    const isVisibility = track.kind === TrackKind.VISIBILITY;
    if (isVisibility) {
      showBeforeAppearing(track);
    }
  }

  return results.includes(false) ? null : [...tracks.values()];
}
