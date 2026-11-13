import { tracksOf } from "./animation-tracks.ts";
import type { Track } from "./animation-tracks.ts";
import { AnimationDirection, AnimationFill, storyboardXaml } from "./animation-xaml.ts";
import type { AnimationSpec } from "./animation-xaml.ts";
import { isLinear, parseEasing } from "./easing.ts";
import { LINKABLE, linkedTracksOf } from "./linked-tracks.ts";
import type {
  ExpansionInput,
  GroupInput,
  Output,
  PropertyGroup,
  WriteContext
} from "./property-kit.ts";
import { writeLinked } from "./scroll-link.ts";
import type { LinkedAnimation } from "./scroll-link.ts";
import { longhand } from "./shorthands.ts";
import { DEFAULT_ORIGIN, pivotRenderTransform, RENDER_ORIGIN_TARGET } from "./transform-origin.ts";
import type { Declaration } from "./types.ts";
import { parseRangePoint, parseTimeline, splitRange, TimelineKind } from "#src/css/parse/scroll-timeline.js";
import type { RangePoint, TimelineRef } from "#src/css/parse/scroll-timeline.js";
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
const TIMELINE = "animation-timeline";
const RANGE = "animation-range";
const RANGE_START = "animation-range-start";
const RANGE_END = "animation-range-end";
const ANIMATION_TARGET = "animation";
const LINKED_TARGET = "scroll-animation";
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

/** The longhands that link an animation to a timeline; the shorthand sets only a timeline it names. */
export const TIMELINE_MEMBERS = [TIMELINE, RANGE_START, RANGE_END] as const;

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
  [PLAY_STATE, "running"],
  [TIMELINE, "auto"],
  [RANGE_START, "normal"],
  [RANGE_END, "normal"]
]);
const DASHED_NAME = /^--[\w-]+$/u;

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

function isTimelineWord(lower: string) {
  const isFunction = lower.startsWith("scroll(") || lower.startsWith("view(");
  return isFunction || lower === "auto" || DASHED_NAME.test(lower);
}

// The members whose keyword or number a word may be, tried in order.
const WORD_MEMBERS: readonly (readonly [string, (lower: string) => boolean])[] = [
  [TIMING, lower => parseEasing(lower) !== null],
  [ITERATIONS, isIterationCount],
  [DIRECTION, lower => DIRECTIONS.has(lower)],
  [FILL, lower => FILLS.has(lower) && lower !== NONE],
  [PLAY_STATE, lower => PLAY_STATES.has(lower)],
  [TIMELINE, isTimelineWord]
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

/** `animation`: each item sets the eight longhands, those it omits to their initial value, and a timeline it names. */
function expandAnimation({ declaration }: ExpansionInput) {
  const items = splitCommas(declaration.value).map(itemValues);
  const isLinked = items.some(values => values.get(TIMELINE) !== INITIAL.get(TIMELINE));
  return [...ANIMATION_MEMBERS, ...isLinked ? [TIMELINE] : []].map(member => longhand({
    declaration,
    property: member,
    value: items.map(values => values.get(member) ?? INITIAL.get(member) ?? "").join(LIST_SEPARATOR)
  }));
}

/** `animation-range`: each comma-separated item sets the start and the end of the range. */
function expandRange({ declaration, reader }: ExpansionInput) {
  const items = splitCommas(declaration.value).map(item => splitRange(item.trim()));
  const [reason] = items.flatMap(item => item.isValid ? [] : [item.reason]);
  const hasFailed = reason !== undefined;
  if (hasFailed) {
    reader.error(`${RANGE}: ${reason}`);
    return [];
  }

  const ranges = items.flatMap(item => item.isValid ? [item.value] : []);
  return [
    longhand({
      declaration,
      property: RANGE_START,
      value: ranges.map(range => range.start).join(LIST_SEPARATOR)
    }),
    longhand({
      declaration,
      property: RANGE_END,
      value: ranges.map(range => range.end).join(LIST_SEPARATOR)
    })
  ];
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

// `animation-timeline` of one item, or null after an error.
function timelineItem({ input, i }: Omit<ReadInput, "member">) {
  const parsed = parseTimeline(
    itemText({
      input,
      i,
      member: TIMELINE
    })
  );
  return parsed.isValid ? parsed.value : readerOf({
    input,
    member: TIMELINE
  }).error(`${TIMELINE}: ${parsed.reason}`);
}

// One end of `animation-range` for an item: the point (null for `normal`), or null after an error.
function rangeItem({ input, i, member }: ReadInput) {
  const parsed = parseRangePoint({
    text: itemText({
      input,
      i,
      member
    }),
    isEnd: member === RANGE_END
  });
  return parsed.isValid ? {
    point: parsed.value
  } : readerOf({
    input,
    member
  }).error(`${member}: ${parsed.reason}`);
}

// Why a timeline-linked item cannot play as it is written, or null.
function linkFault({ easing, direction, iterations }: {
  easing: string;
  direction: AnimationDirection;
  iterations: number | null;
}) {
  const parsed = parseEasing(easing);
  const isStraight = parsed !== null && isLinear(parsed);
  if (!isStraight) {
    return `${TIMING}: a scroll-linked animation maps the scroll position straight onto its key frames; write linear (found "${easing}")`;
  }

  const isOnce = iterations === 1;
  if (!isOnce) {
    return "animation-iteration-count: a scroll-linked animation runs once across its range; write 1";
  }

  const isPlayedBack = direction === AnimationDirection.NORMAL || direction === AnimationDirection.REVERSE;
  return isPlayedBack ? null : `${DIRECTION}: a scroll-linked animation runs forwards or in reverse; write normal or reverse (found "${direction}")`;
}

function hasKeyframeEasing(tracks: readonly Track[]) {
  return tracks.some(track => track.frames.some(frame => {
    const parsed = frame.easing === null ? null : parseEasing(frame.easing);
    return parsed !== null && !isLinear(parsed);
  }));
}

type LinkingTimeline = Exclude<TimelineRef, { kind: typeof TimelineKind.AUTO | typeof TimelineKind.NONE }>;

// The fault of a linked item once its parts are read, or null.
function linkedTracksFault({ timeline, points, tracks, name }: {
  timeline: LinkingTimeline;
  points: readonly RangePoint[];
  tracks: readonly Track[];
  name: string;
}) {
  const isScroll = timeline.kind === TimelineKind.SCROLL;
  const hasName = points.some(point => point.name !== null);
  const isNameMisplaced = isScroll && hasName;
  if (isNameMisplaced) {
    return `${RANGE}: a range name (cover, entry, exit...) belongs to a view timeline; scroll() takes a length or a percentage of the scroll range`;
  }

  if (hasKeyframeEasing(tracks)) {
    return `@keyframes ${name}: a scroll-linked animation maps the scroll position straight onto its key frames; remove the animation-timing-function of its key frames`;
  }

  const { unsupported } = linkedTracksOf(tracks);
  return unsupported.length === 0 ? null : `${TIMELINE}: @keyframes ${name} animates ${unsupported.join(", ")}, which Composition cannot drive from a scroll position (it drives ${LINKABLE}); animate those with a time-based animation`;
}

// One animation of the list linked to a timeline, or null where it has a fault.
function linkOf({ input, i, name, timeline }: {
  input: GroupInput;
  i: number;
  name: string;
  timeline: LinkingTimeline;
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
  const direction = keywordItem({
    ...item,
    member: DIRECTION,
    choices: DIRECTIONS
  });
  const iterations = iterationItem(item);
  const start = rangeItem({
    ...item,
    member: RANGE_START
  });
  const end = rangeItem({
    ...item,
    member: RANGE_END
  });
  const isResolved = tracks !== null && easing !== null && direction !== null && start !== null && end !== null;
  const isPlayed = isResolved && tracks.length > 0;
  if (!isPlayed) {
    return null;
  }

  const reporter = readerOf({
    input,
    member: TIMELINE
  });
  const fault = linkFault({
    easing,
    direction,
    iterations
  }) ?? linkedTracksFault({
    timeline,
    points: [start.point, end.point].flatMap(point => point === null ? [] : [point]),
    tracks,
    name
  });
  const hasFault = fault !== null;
  if (hasFault) {
    return reporter.error(fault);
  }

  return {
    timeline,
    start: start.point,
    end: end.point,
    isReversed: direction === AnimationDirection.REVERSE,
    tracks: linkedTracksOf(tracks).linked
  } satisfies LinkedAnimation;
}

function isLinking(timeline: TimelineRef | null): timeline is LinkingTimeline {
  return timeline !== null && timeline.kind !== TimelineKind.AUTO && timeline.kind !== TimelineKind.NONE;
}

// The animations the declarations resolve to, by what drives them; an item with a fault is dropped.
function specsOf(input: GroupInput) {
  const items = listOf(input.computed.get(NAME)).map((name, i) => ({
    name,
    i,
    timeline: timelineItem({
      input,
      i
    })
  }));
  const specs = items.flatMap(({ name, i, timeline }) => timeline?.kind === TimelineKind.AUTO ? [specOf({
    input,
    i,
    name
  })] : []);
  const links = items.flatMap(({ name, i, timeline }) => isLinking(timeline) ? [linkOf({
    input,
    i,
    name,
    timeline
  })] : []);
  return {
    specs: specs.filter(spec => spec !== null),
    links: links.filter(link => link !== null)
  };
}

function animation(input: GroupInput) {
  const { specs, links } = specsOf(input);
  const linkWrite = links.length === 0 ? [] : [{
    kind: "write",
    target: LINKED_TARGET,
    value: writeLinked(links)
  } as const];
  const isIdle = specs.length === 0;
  if (isIdle) {
    return linkWrite;
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
    ...pivot,
    ...linkWrite
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
    members: [...ANIMATION_MEMBERS, ...TIMELINE_MEMBERS],
    lower: animation,
    shorthands: new Map([[ANIMATION, expandAnimation], [RANGE, expandRange]]),
    writes: {
      [ANIMATION_TARGET]: startAnimations,
      [RENDER_ORIGIN_TARGET]: pivotRenderTransform
    }
  }] satisfies PropertyGroup[];
}
