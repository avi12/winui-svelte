import { tracksOf } from "./animation-tracks.ts";
import { AnimationDirection, AnimationFill, storyboardXaml } from "./animation-xaml.ts";
import type { AnimationSpec } from "./animation-xaml.ts";
import { parseEasing } from "./easing.ts";
import type {
  ExpansionInput,
  GroupInput,
  Output,
  PropertyGroup,
  WriteContext
} from "./property-kit.ts";
import { longhand } from "./shorthands.ts";
import { DEFAULT_ORIGIN, pivotRenderTransform, RENDER_ORIGIN_TARGET } from "./transform-origin.ts";
import type { Declaration } from "./types.ts";
import { parseNumber, splitCommas, splitWords } from "#src/css/parse/values.js";
import { parseMilliseconds } from "#src/css/parse/values.js";

const ANIMATION = "animation";
const NAME = "animation-name";
const DURATION = "animation-duration";
const TIMING = "animation-timing-function";
const DELAY = "animation-delay";
const ITERATIONS = "animation-iteration-count";
const DIRECTION = "animation-direction";
const FILL = "animation-fill-mode";
const PLAY_STATE = "animation-play-state";
const ANIMATION_TARGET = "animation";
const NONE = "none";
const INFINITE = "infinite";
const PAUSED = "paused";
const LIST_SEPARATOR = ", ";

/** The longhands of `animation`, which its shorthand expands to. */
export const ANIMATION_MEMBERS = [
  NAME,
  DURATION,
  TIMING,
  DELAY,
  ITERATIONS,
  DIRECTION,
  FILL,
  PLAY_STATE
] as const;

const DIRECTIONS: ReadonlyMap<string, AnimationDirection> = new Map(
  Object.values(AnimationDirection).map(direction => [direction, direction] as const)
);
const FILLS: ReadonlyMap<string, AnimationFill> = new Map(
  Object.values(AnimationFill).map(fill => [fill, fill] as const)
);
const PLAY_STATES: ReadonlyMap<string, string> = new Map([["running", "running"], [PAUSED, PAUSED]] as const);
const INITIAL = new Map<string, string>([
  [NAME, NONE],
  [DURATION, "0s"],
  [TIMING, "ease"],
  [DELAY, "0s"],
  [ITERATIONS, "1"],
  [DIRECTION, "normal"],
  [FILL, NONE],
  [PLAY_STATE, "running"]
]);

// The specs the lowering resolved, by the text the write carries: the write is a
// string, and the runtime that applies it is the one that lowered it.
const resolved = new Map<string, AnimationSpec[]>();

// A time with a sign: `parseMilliseconds` reads the magnitude.
function signedMilliseconds(token: string) {
  const isNegative = token.startsWith("-");
  const amount = parseMilliseconds(isNegative ? token.slice(1) : token);
  const sign = isNegative ? -1 : 1;
  return amount === null ? null : sign * amount;
}

function isTime(token: string) {
  return signedMilliseconds(token) !== null;
}

function isIterationCount(token: string) {
  return token.toLowerCase() === INFINITE || parseNumber(token) !== null;
}

// The members whose keyword or number a word may be, tried in order.
const WORD_MEMBERS: ReadonlyArray<readonly [string, (lower: string) => boolean]> = [
  [TIMING, lower => parseEasing(lower) !== null],
  [ITERATIONS, isIterationCount],
  [DIRECTION, lower => DIRECTIONS.has(lower)],
  [FILL, lower => FILLS.has(lower) && lower !== NONE],
  [PLAY_STATE, lower => PLAY_STATES.has(lower)]
];

// The member each word of one `animation` item belongs to; the first time is the
// duration and the second the delay; a word that is none of them is the name.
function classify({ word, hasDuration }: {
  word: string;
  hasDuration: boolean;
}) {
  const lower = word.toLowerCase();
  const timeMember = hasDuration ? DELAY : DURATION;
  return isTime(word) ? timeMember : WORD_MEMBERS.find(([, matches]) => matches(lower))?.[0] ?? NAME;
}

// One item of the shorthand's list as the value of each longhand.
function itemValues(item: string) {
  const values = new Map(INITIAL);
  let hasDuration = false;
  for (const word of splitWords(item)) {
    const member = classify({
      word,
      hasDuration
    });
    hasDuration ||= member === DURATION;
    values.set(member, word);
  }

  return values;
}

/** `animation`: each comma-separated item sets the eight longhands, those it leaves out to their initial value. */
function expandAnimation({ declaration }: ExpansionInput) {
  const items = splitCommas(declaration.value).map(itemValues);
  return ANIMATION_MEMBERS.map(member => longhand({
    declaration,
    property: member,
    value: items.map(values => values.get(member) ?? INITIAL.get(member) ?? "").join(LIST_SEPARATOR)
  }));
}

// The comma list a longhand holds, which a shorter list repeats to the length of the names.
function listOf(declaration: Declaration | undefined) {
  return declaration === undefined ? [] : splitCommas(declaration.value).map(item => item.trim());
}

function itemOf({ list, i, initial }: {
  list: readonly string[];
  i: number;
  initial: string;
}) {
  return list.length === 0 ? initial : list[i % list.length] ?? initial;
}

// The reader of a longhand the element wrote; one it did not write has its initial value, which cannot fail.
function readerOf({ input, member }: {
  input: GroupInput;
  member: string;
}) {
  return input.readers.get(member) ?? input.reading(NAME);
}

interface ReadInput {
  input: GroupInput;
  i: number;
  member: string;
}

function itemText({ input, i, member }: ReadInput) {
  return itemOf({
    list: listOf(input.computed.get(member)),
    i,
    initial: INITIAL.get(member) ?? ""
  });
}

// One item of a keyword longhand, or null after reporting the others it could be.
function keywordItem<Value extends string>({ input, i, member, choices }: ReadInput & {
  choices: ReadonlyMap<string, Value>;
}) {
  return readerOf({
    input,
    member
  }).keyword({
    token: itemText({
      input,
      i,
      member
    }),
    choices
  });
}

function timeItem({ input, i, member }: ReadInput) {
  const text = itemText({
    input,
    i,
    member
  });
  const milliseconds = signedMilliseconds(text);
  return milliseconds ?? readerOf({
    input,
    member
  }).expectedToken({
    what: "a time in s or ms",
    token: text
  });
}

// `infinite` as null, a whole count of at least one as itself.
function iterationItem({ input, i }: Omit<ReadInput, "member">) {
  const reader = readerOf({
    input,
    member: ITERATIONS
  });
  const text = itemText({
    input,
    i,
    member: ITERATIONS
  });
  const isInfinite = text.toLowerCase() === INFINITE;
  if (isInfinite) {
    return null;
  }

  const count = parseNumber(text);
  const isWhole = count !== null && Number.isInteger(count) && count >= 0;
  return isWhole ? count : reader.expectedToken({
    what: "infinite or a whole number (a fraction of an iteration has no WinUI meaning)",
    token: text
  });
}

// The tracks of the keyframes an animation names: null after an error, or where
// the keyframes belong to a sheet this one cannot see (the build checks the name
// only when it is complete, which the app's runtime is).
function tracksNamed({ input, name }: {
  input: GroupInput;
  name: string;
}) {
  const isNone = name.toLowerCase() === NONE;
  const keyframes = isNone ? undefined : input.options.keyframes?.find(name);
  const isUnknown = !isNone && keyframes === undefined && input.options.keyframes?.isComplete === true;
  if (isUnknown) {
    return input.reading(NAME).error(`${NAME}: @keyframes ${name} is not declared in any stylesheet`);
  }

  return keyframes === undefined ? [] : tracksOf({
    keyframes,
    report: ({ message, at }) => input.options.report({
      severity: "error",
      message,
      position: at
    })
  });
}

// The `animation-timing-function` of an item as CSS text, or null after an error.
function easingItem({ input, i }: Omit<ReadInput, "member">) {
  const text = itemText({
    input,
    i,
    member: TIMING
  });
  const isEasing = parseEasing(text) !== null;
  return isEasing ? text : readerOf({
    input,
    member: TIMING
  }).expectedToken({
    what: "a timing function (ease, linear, cubic-bezier(), steps()...)",
    token: text
  });
}

// One animation of the list, or null where it has a fault or plays nothing.
function specOf({ input, i, name }: {
  input: GroupInput;
  i: number;
  name: string;
}) {
  const item = {
    input,
    i
  };
  const tracks = tracksNamed({
    input,
    name
  });
  const easing = easingItem(item);
  const durationMs = timeItem({
    ...item,
    member: DURATION
  });
  const delayMs = timeItem({
    ...item,
    member: DELAY
  });
  const direction = keywordItem({
    ...item,
    member: DIRECTION,
    choices: DIRECTIONS
  });
  const fill = keywordItem({
    ...item,
    member: FILL,
    choices: FILLS
  });
  const state = keywordItem({
    ...item,
    member: PLAY_STATE,
    choices: PLAY_STATES
  });
  const iterations = iterationItem(item);
  const isResolved = tracks !== null && easing !== null && durationMs !== null && delayMs !== null;
  const hasKeywords = direction !== null && fill !== null && state !== null;
  const isPlayed = isResolved && hasKeywords && iterations !== 0 && tracks.length > 0;
  return isPlayed ? {
    name,
    durationMs,
    delayMs,
    easing,
    iterations,
    direction,
    fill,
    isPaused: state === PAUSED,
    tracks
  } satisfies AnimationSpec : null;
}

// The specs the declarations resolve to; an item with a fault is dropped.
function specsOf(input: GroupInput) {
  const names = listOf(input.computed.get(NAME));
  const specs = names.map((name, i) => specOf({
    input,
    i,
    name
  }));
  return specs.filter(spec => spec !== null);
}

function animation(input: GroupInput) {
  const specs = specsOf(input);
  const isIdle = specs.length === 0;
  if (isIdle) {
    return [];
  }

  const value = JSON.stringify(specs);
  resolved.set(value, specs);
  const hasTransform = specs.some(spec => spec.tracks.some(track => track.isTransform));
  const conflict = ["transform-origin", "scale", "rotate"].find(member => input.computed.has(member));
  const isConflicting = hasTransform && conflict !== undefined;
  if (isConflicting) {
    input.reading(NAME).error(`${conflict} cannot be combined with an animated transform (WinUI refuses CenterPoint, Scale and Rotation on an element whose RenderTransform is in use)`);
    return [];
  }

  const pivot = hasTransform ? [{
    kind: "write",
    target: RENDER_ORIGIN_TARGET,
    value: DEFAULT_ORIGIN
  } as const] : [];
  return [
    {
      kind: "write",
      target: ANIMATION_TARGET,
      value
    } as const,
    ...pivot
  ] satisfies Output[];
}

// Begins the element's storyboards and stops them (restoring what they replaced) when the write goes.
function startAnimations({ native, control, value }: WriteContext) {
  const specs = resolved.get(value) ?? [];
  return native.animate({
    control,
    storyboards: specs.map(spec => ({
      xaml: storyboardXaml(spec),
      isPaused: spec.isPaused
    })),
    hasTransform: specs.some(spec => spec.tracks.some(track => track.isTransform)),
    brushes: specs.flatMap(spec => spec.tracks.flatMap(track => {
      const [first] = track.frames;
      const { brush } = track;
      const isBrushed = brush !== null && first !== undefined;
      return isBrushed ? [{
        property: brush,
        color: String(first.value)
      }] : [];
    }))
  });
}

/**
 * The property group of `animation` and its longhands, with `@keyframes`
 * (which a sheet holds as data). An animation runs on a Storyboard begun when
 * the rule applies and stopped when it stops applying. Apart from the built-in
 * groups, as the gradients are: a sheet that uses one registers them.
 */
export function animationGroups() {
  return [{
    members: [...ANIMATION_MEMBERS],
    lower: animation,
    shorthands: new Map([[ANIMATION, expandAnimation]]),
    writes: {
      [ANIMATION_TARGET]: startAnimations,
      [RENDER_ORIGIN_TARGET]: pivotRenderTransform
    }
  }] satisfies PropertyGroup[];
}
