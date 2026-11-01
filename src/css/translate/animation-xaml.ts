import { TrackKind } from "./animation-tracks.ts";
import type { Track } from "./animation-tracks.ts";
import { XAML_NAMESPACES } from "./cascade.ts";
import {
  isLinear,
  LINEAR,
  mirrorEasing,
  parseEasing,
  stepLevels
} from "./easing.ts";
import type { Easing } from "./easing.ts";

/** Which way the keyframes run on each iteration. */
export const AnimationDirection = {
  NORMAL: "normal",
  REVERSE: "reverse",
  ALTERNATE: "alternate",
  ALTERNATE_REVERSE: "alternate-reverse"
} as const;

/** One of the directions in `AnimationDirection`. */
export type AnimationDirection = (typeof AnimationDirection)[keyof typeof AnimationDirection];

/** What an animation does before it starts and after it ends. */
export const AnimationFill = {
  NONE: "none",
  FORWARDS: "forwards",
  BACKWARDS: "backwards",
  BOTH: "both"
} as const;

/** One of the fill modes in `AnimationFill`. */
export type AnimationFill = (typeof AnimationFill)[keyof typeof AnimationFill];

/** One animation of an element, resolved: what the runtime turns into a Storyboard. */
export interface AnimationSpec {
  name: string;
  durationMs: number;
  delayMs: number;
  /** The `animation-timing-function`, as CSS text. */
  easing: string;
  /** Null repeats forever. */
  iterations: number | null;
  direction: AnimationDirection;
  fill: AnimationFill;
  isPaused: boolean;
  tracks: Track[];
}

const DISCRETE = "discrete";
const LINEAR_MODE = "linear";

/** How a key frame is reached: a jump, a straight line, or along an easing's curve. */
type Mode = typeof DISCRETE | typeof LINEAR_MODE | Easing;

interface Frame {
  t: number;
  value: number | string;
  mode: Mode;
}

interface Point {
  t: number;
  value: number | string;
}

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const PAD = 2;
const MILLISECOND_DIGITS = 3;
const SPLINE_DIGITS = 4;
const MIN_BUMP_MS = 1;
const ARGB_LENGTH = 9;
const CHANNELS = 4;
const HEX_RADIX = 16;
const ALTERNATE_CYCLE = 2;
const FOREVER = "Forever";
const OBJECT_KEYFRAME = "Object";
const KEYFRAME_TYPES = new Map<TrackKind, string>([
  [TrackKind.DOUBLE, "Double"],
  [TrackKind.COLOR, "Color"],
  [TrackKind.VISIBILITY, OBJECT_KEYFRAME]
]);

function pad(amount: number) {
  return String(amount).padStart(PAD, "0");
}

/** A TimeSpan as XAML spells it: `h:mm:ss.fff`, with a sign when negative. */
export function timeSpan(milliseconds: number) {
  const sign = milliseconds < 0 ? "-" : "";
  const total = Math.round(Math.abs(milliseconds));
  const fraction = String(total % MILLISECONDS_PER_SECOND).padStart(MILLISECOND_DIGITS, "0");
  const seconds = Math.floor(total / MILLISECONDS_PER_SECOND);
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  return `${sign}${hours}:${pad(minutes % MINUTES_PER_HOUR)}:${pad(seconds % SECONDS_PER_MINUTE)}.${fraction}`;
}

function channelAt({ color, i }: {
  color: string;
  i: number;
}) {
  return Number.parseInt(color.slice(1 + i * PAD, 1 + (i + 1) * PAD), HEX_RADIX);
}

// A, R, G, B of `#RRGGBB` or `#AARRGGBB`.
function argb(color: string) {
  const full = color.length === ARGB_LENGTH ? color : `#FF${color.slice(1)}`;
  return Array.from({ length: CHANNELS }, (_, i) => channelAt({
    color: full,
    i
  }));
}

function colorText(channels: number[]) {
  const digits = channels.map(channel => Math.round(channel).toString(HEX_RADIX).toUpperCase().padStart(PAD, "0"));
  return `#${digits.join("")}`;
}

function roundedText(value: number) {
  return String(Number(value.toFixed(SPLINE_DIGITS)));
}

function valueText({ value, kind }: {
  value: number | string;
  kind: string;
}) {
  const isObject = kind === OBJECT_KEYFRAME;
  if (isObject) {
    return String(value);
  }

  return typeof value === "number" ? roundedText(value) : colorText(argb(value));
}

/** The value `fraction` of the way from `from` to `to`; colors mix channel by channel. */
function mix({ from, to, fraction }: {
  from: number | string;
  to: number | string;
  fraction: number;
}) {
  const isNumeric = typeof from === "number" && typeof to === "number";
  if (isNumeric) {
    return from + (to - from) * fraction;
  }

  const target = argb(String(to));
  return colorText(argb(String(from)).map((channel, i) => channel + ((target[i] ?? channel) - channel) * fraction));
}

const ALTERNATING: readonly AnimationDirection[] = [AnimationDirection.ALTERNATE, AnimationDirection.ALTERNATE_REVERSE];
const REVERSED_IN = new Map<AnimationDirection, (iteration: number) => boolean>([
  [AnimationDirection.NORMAL, () => false],
  [AnimationDirection.REVERSE, () => true],
  [AnimationDirection.ALTERNATE, iteration => iteration % ALTERNATE_CYCLE === 1],
  [AnimationDirection.ALTERNATE_REVERSE, iteration => iteration % ALTERNATE_CYCLE === 0]
]);

// The points of one run through a track, in the order the direction plays them,
// with the easing of the interval that follows each.
function run({ track, spec, isReversed }: {
  track: Track;
  spec: AnimationSpec;
  isReversed: boolean;
}) {
  const fallback = parseEasing(spec.easing) ?? LINEAR;
  const points: Point[] = track.frames.map(frame => ({
    t: frame.offset * spec.durationMs,
    value: frame.value
  }));
  const isStepped = track.kind === TrackKind.VISIBILITY;
  const easings = track.frames.map(frame => {
    const timingFunction = isStepped ? null : frame.easing;
    const isFallback = timingFunction === null;
    return isFallback ? fallback : parseEasing(timingFunction) ?? fallback;
  });
  if (!isReversed) {
    return {
      points,
      easings
    };
  }

  return {
    points: points.map(point => ({
      ...point,
      t: spec.durationMs - point.t
    })).toReversed(),
    // The interval k..k+1 played backwards starts at k+1, with the mirrored easing.
    easings: easings.slice(0, -1).map(mirrorEasing).toReversed()
  };
}

function jump({ t, value }: Point) {
  return {
    t,
    value,
    mode: DISCRETE
  } satisfies Frame;
}

// One interval: a spline or linear key frame, or the discrete frames of a steps() easing.
function interval({ from, to, easing }: {
  from: Point;
  to: Point;
  easing: Easing;
}) {
  const isCurve = easing.kind === "bezier";
  if (isCurve) {
    return [{
      t: to.t,
      value: to.value,
      mode: isLinear(easing) ? LINEAR_MODE : easing
    } satisfies Frame];
  }

  const levels = stepLevels(easing);
  return [
    ...levels.map((level, step) => jump({
      t: from.t + step / levels.length * (to.t - from.t),
      value: mix({
        from: from.value,
        to: to.value,
        fraction: level
      })
    })),
    jump(to)
  ];
}

// The key frames of a run, from `base`: the first point jumps (or, when the
// track starts after offset 0, is reached from the element's own value), each
// later one is reached by its interval's easing.
function runFrames({ points, easings, base, startEasing }: {
  points: Point[];
  easings: Easing[];
  base: number;
  startEasing: Easing;
}) {
  const frames: Frame[] = [];
  let previous: Point | null = null;
  for (const [i, point] of points.entries()) {
    const placed = {
      t: base + point.t,
      value: point.value
    };
    frames.push(
      ...previous === null ? [{
        ...placed,
        mode: point.t === 0 ? DISCRETE : startEasing
      } satisfies Frame] : interval({
        from: previous,
        to: placed,
        easing: easings[i - 1] ?? LINEAR
      })
    );
    previous = placed;
  }

  return frames;
}

// How many iterations are written out, and how often WinUI repeats them: a
// cycle of an alternating animation is two iterations.
function timing(spec: AnimationSpec) {
  const isAlternating = ALTERNATING.includes(spec.direction);
  const cycle = isAlternating ? ALTERNATE_CYCLE : 1;
  const { iterations } = spec;
  const isForever = iterations === null;
  if (isForever) {
    return {
      written: cycle,
      repeat: FOREVER
    };
  }

  const isRepeatedWhole = iterations > cycle && iterations % cycle === 0;
  return isRepeatedWhole ? {
    written: cycle,
    repeat: `${iterations / cycle}x`
  } : {
    written: iterations,
    repeat: null
  };
}

// Strictly increasing times: a jump at the time of the frame before it lands a millisecond later.
function ordered(frames: Frame[]) {
  const result: Frame[] = [];
  for (const frame of frames) {
    const last = result.at(-1);
    const isLate = last !== undefined && frame.t <= last.t;
    result.push(
      isLate ? {
        ...frame,
        t: last.t + MIN_BUMP_MS
      } : frame
    );
  }

  return result;
}

function trackFrames({ track, spec, written, hold }: {
  track: Track;
  spec: AnimationSpec;
  written: number;
  hold: number;
}) {
  const startEasing = parseEasing(spec.easing) ?? LINEAR;
  const frames: Frame[] = [];
  for (let iteration = 0; iteration < written; iteration++) {
    const { points, easings } = run({
      track,
      spec,
      isReversed: REVERSED_IN.get(spec.direction)?.(iteration) ?? false
    });
    const next = runFrames({
      points,
      easings,
      base: hold + iteration * spec.durationMs,
      startEasing
    });
    const [start] = next;
    const isSeamless = start?.mode === DISCRETE && frames.at(-1)?.value === start.value;
    frames.push(...isSeamless ? next.slice(1) : next);
  }

  const isStepped = track.kind === TrackKind.VISIBILITY;
  const steps = isStepped ? frames.map(jump) : frames;
  const [first] = steps;
  const isHeld = hold > 0 && first?.mode === DISCRETE;
  return ordered(
    isHeld ? [{
      ...first,
      t: 0
    }, ...steps] : steps
  );
}

function keySpline(easing: Easing) {
  const isCurve = easing.kind === "bezier";
  if (!isCurve) {
    return "";
  }

  const [firstX, firstY, secondX, secondY] = [easing.x1, easing.y1, easing.x2, easing.y2].map(roundedText);
  return ` KeySpline="${firstX},${firstY} ${secondX},${secondY}"`;
}

const FRAME_NAMES = new Map<string, string>([
  [DISCRETE, "Discrete"],
  [LINEAR_MODE, "Linear"]
]);

function keyFrameXaml({ frame, kind }: {
  frame: Frame;
  kind: string;
}) {
  const named = typeof frame.mode === "string" ? FRAME_NAMES.get(frame.mode) : undefined;
  const spline = typeof frame.mode === "string" ? "" : keySpline(frame.mode);
  return `<${named ?? "Spline"}${kind}KeyFrame KeyTime="${timeSpan(frame.t)}" Value="${valueText({
    value: frame.value,
    kind
  })}"${spline}/>`;
}

function trackXaml({ track, spec, written, repeat, hold, delay }: {
  track: Track;
  spec: AnimationSpec;
  written: number;
  repeat: string | null;
  hold: number;
  delay: number;
}) {
  const kind = KEYFRAME_TYPES.get(track.kind) ?? "Double";
  const isFilled = spec.fill === AnimationFill.FORWARDS || spec.fill === AnimationFill.BOTH;
  const attributes = [
    `Storyboard.TargetProperty="${track.target}"`,
    track.kind === TrackKind.DOUBLE ? "EnableDependentAnimation=\"True\"" : "",
    `BeginTime="${timeSpan(delay)}"`,
    `FillBehavior="${isFilled ? "HoldEnd" : "Stop"}"`,
    repeat === null ? "" : `RepeatBehavior="${repeat}"`
  ].filter(attribute => attribute !== "");
  const children = trackFrames({
    track,
    spec,
    written,
    hold
  }).map(frame => keyFrameXaml({
    frame,
    kind
  }));
  return `<${kind}AnimationUsingKeyFrames ${attributes.join(" ")}>${children.join("")}</${kind}AnimationUsingKeyFrames>`;
}

/**
 * The XAML of a Storyboard for one resolved animation. Iterations and
 * directions are written out as key frames (a repeat of a whole cycle is
 * WinUI's own), the timing functions become KeySplines, `steps()` becomes
 * discrete frames, and a delay before a `backwards` fill is a held first frame.
 */
export function storyboardXaml(spec: AnimationSpec) {
  const { written, repeat } = timing(spec);
  const isFilledBefore = spec.fill === AnimationFill.BACKWARDS || spec.fill === AnimationFill.BOTH;
  const isHeld = repeat === null && spec.delayMs > 0 && isFilledBefore;
  const animations = spec.tracks.map(track => trackXaml({
    track,
    spec,
    written,
    repeat,
    hold: isHeld ? spec.delayMs : 0,
    delay: isHeld ? 0 : spec.delayMs
  }));
  return `<Storyboard ${XAML_NAMESPACES}>${animations.join("")}</Storyboard>`;
}
