import { splitWords } from "./split.ts";
import { parseLength, parsePercent } from "./values.ts";

// The scroll-driven animation values of CSS: `animation-timeline` (`scroll()`,
// `view()` or a named timeline), the axis and inset of a timeline, and
// `animation-range`. The build reads them; the window links an animation to a
// scroll viewer with them (src/win2d/scroll-link.ts).

/** The two directions a scroll viewer scrolls; `block` and `y` are vertical, `inline` and `x` horizontal. */
export const ScrollAxis = {
  VERTICAL: "y",
  HORIZONTAL: "x"
} as const;

/** One of the axes in `ScrollAxis`. */
export type ScrollAxis = (typeof ScrollAxis)[keyof typeof ScrollAxis];

/** Which scroll viewer `scroll()` measures. */
export const Scroller = {
  NEAREST: "nearest",
  ROOT: "root",
  SELF: "self"
} as const;

/** One of the scrollers in `Scroller`. */
export type Scroller = (typeof Scroller)[keyof typeof Scroller];

/** What an `animation-timeline` item says. */
export const TimelineKind = {
  AUTO: "auto",
  NONE: "none",
  SCROLL: "scroll",
  VIEW: "view",
  NAMED: "named"
} as const;

/** One of the kinds in `TimelineKind`. */
export type TimelineKind = (typeof TimelineKind)[keyof typeof TimelineKind];

/** The named parts of a view timeline that `animation-range` may start and end at. */
export const RangeName = {
  COVER: "cover",
  CONTAIN: "contain",
  ENTRY: "entry",
  EXIT: "exit",
  ENTRY_CROSSING: "entry-crossing",
  EXIT_CROSSING: "exit-crossing"
} as const;

/** One of the range names in `RangeName`. */
export type RangeName = (typeof RangeName)[keyof typeof RangeName];

/** A length or a percentage: `pixels` plus `fraction` of the whole it is measured against. */
export interface Offset {
  readonly pixels: number;
  readonly fraction: number;
}

/** One side of a view timeline's inset: `auto` (none) or an offset into the scrollport. */
export interface Inset {
  readonly isAuto: boolean;
  readonly offset: Offset;
}

/** The scrollport edges a view timeline measures from. */
export interface ViewInset {
  readonly start: Inset;
  readonly end: Inset;
}

/** An `animation-timeline` item, resolved. */
export type TimelineRef =
  | { readonly kind: typeof TimelineKind.AUTO | typeof TimelineKind.NONE }
  | {
    readonly kind: typeof TimelineKind.SCROLL;
    readonly scroller: Scroller;
    readonly axis: ScrollAxis;
  }
  | {
    readonly kind: typeof TimelineKind.VIEW;
    readonly axis: ScrollAxis;
    readonly inset: ViewInset;
  }
  | {
    readonly kind: typeof TimelineKind.NAMED;
    readonly name: string;
  };

/** A position in an `animation-range`: inside a named part, or the whole timeline when `name` is null. */
export interface RangePoint {
  readonly name: RangeName | null;
  readonly offset: Offset;
}

const FUNCTION = /^([a-z-]+)\((.*)\)$/isu;
const DASHED_IDENT = /^--[\w-]+$/u;
const AUTO = "auto";
const NORMAL = "normal";
const SCROLLERS: ReadonlyMap<string, Scroller> = new Map(Object.values(Scroller).map(scroller => [scroller, scroller]));
const AXES: ReadonlyMap<string, ScrollAxis> = new Map([
  ["block", ScrollAxis.VERTICAL],
  ["y", ScrollAxis.VERTICAL],
  ["inline", ScrollAxis.HORIZONTAL],
  ["x", ScrollAxis.HORIZONTAL]
]);
const RANGE_NAMES: ReadonlyMap<string, RangeName> = new Map(Object.values(RangeName).map(name => [name, name]));
const NO_OFFSET: Offset = {
  pixels: 0,
  fraction: 0
};
const NO_INSET: Inset = {
  isAuto: true,
  offset: NO_OFFSET
};
const AXIS_WORDS = [...AXES.keys()].join(", ");
const SCROLLER_WORDS = Object.values(Scroller).join(", ");
const RANGE_WORDS = Object.values(RangeName).join(", ");
const MAX_INSETS = 2;

function invalid(reason: string) {
  return {
    isValid: false,
    reason
  } as const;
}

function valid<Value>(value: Value) {
  return {
    isValid: true,
    value
  } as const;
}

function parseOffset(token: string) {
  const fraction = parsePercent(token);
  const isPercentage = fraction !== null;
  if (isPercentage) {
    return {
      pixels: 0,
      fraction
    } satisfies Offset;
  }

  const pixels = parseLength(token);
  return pixels === null ? null : {
    pixels,
    fraction: 0
  } satisfies Offset;
}

function parseInsetSide(token: string) {
  const isAuto = token.toLowerCase() === AUTO;
  if (isAuto) {
    return NO_INSET;
  }

  const offset = parseOffset(token);
  return offset === null ? null : {
    isAuto: false,
    offset
  } satisfies Inset;
}

/**
 * The `view-timeline-inset` of one timeline (and the inset words of `view()`):
 * one or two sides, each `auto`, a length in px or a percentage of the scrollport; the
 * end side repeats the start one when only one is written.
 */
export function parseViewInset(text: string) {
  const words = splitWords(text);
  const isCountValid = words.length >= 1 && words.length <= MAX_INSETS;
  if (!isCountValid) {
    return invalid(`expected one or two insets (auto, a length in px or a percentage), found "${text}"`);
  }

  const sides = words.map(parseInsetSide);
  const bad = words.find((_word, i) => sides[i] === null);
  const isBadFound = bad !== undefined;
  if (isBadFound) {
    return invalid(`expected auto, a length in px or a percentage, found "${bad}"`);
  }

  const [start = NO_INSET, end = start] = sides.filter(side => side !== null);
  return valid({
    start,
    end
  });
}

/** The axis a word names (`block`, `inline`, `x`, `y`), or null. */
export function parseAxis(word: string) {
  return AXES.get(word.toLowerCase()) ?? null;
}

function parseScrollArguments(argumentsText: string) {
  let scroller: Scroller = Scroller.NEAREST;
  let axis: ScrollAxis = ScrollAxis.VERTICAL;
  let hasScroller = false;
  let hasAxis = false;
  for (const word of splitWords(argumentsText)) {
    const lower = word.toLowerCase();
    const namedScroller = SCROLLERS.get(lower);
    const namedAxis = AXES.get(lower);
    const isUnknown = namedScroller === undefined && namedAxis === undefined;
    const isRepeated = namedScroller === undefined ? hasAxis : hasScroller;
    if (isUnknown) {
      return invalid(`scroll() takes a scroller (${SCROLLER_WORDS}) and an axis (${AXIS_WORDS}), found "${word}"`);
    }

    if (isRepeated) {
      return invalid(`scroll() takes one scroller and one axis, found "${argumentsText}"`);
    }

    hasScroller ||= namedScroller !== undefined;
    hasAxis ||= namedAxis !== undefined;
    scroller = namedScroller ?? scroller;
    axis = namedAxis ?? axis;
  }

  return valid({
    kind: TimelineKind.SCROLL,
    scroller,
    axis
  });
}

function parseViewArguments(argumentsText: string) {
  const words = splitWords(argumentsText);
  const [first] = words;
  const axis = first === undefined ? null : parseAxis(first);
  const insetText = words.slice(axis === null ? 0 : 1).join(" ");
  const isInsetWritten = insetText !== "";
  const inset = isInsetWritten ? parseViewInset(insetText) : valid({
    start: NO_INSET,
    end: NO_INSET
  } satisfies ViewInset);
  if (!inset.isValid) {
    return invalid(`view(): ${inset.reason}`);
  }

  return valid({
    kind: TimelineKind.VIEW,
    axis: axis ?? ScrollAxis.VERTICAL,
    inset: inset.value
  });
}

/**
 * One item of `animation-timeline`: `auto`, `none`, `scroll([nearest | root |
 * self] [block | inline | x | y])`, `view([axis] [inset])` or a dashed name
 * (`--hero`) that a `scroll-timeline-name` or `view-timeline-name` gave.
 */
export function parseTimeline(text: string) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const isAuto = lower === AUTO;
  if (isAuto) {
    return valid({ kind: TimelineKind.AUTO });
  }

  const isNone = lower === TimelineKind.NONE;
  if (isNone) {
    return valid({ kind: TimelineKind.NONE });
  }

  if (DASHED_IDENT.test(trimmed)) {
    return valid({
      kind: TimelineKind.NAMED,
      name: trimmed
    });
  }

  const call = FUNCTION.exec(trimmed);
  const name = call?.[1]?.toLowerCase();
  const argumentsText = call?.[2] ?? "";
  const isScroll = name === TimelineKind.SCROLL;
  if (isScroll) {
    return parseScrollArguments(argumentsText);
  }

  return name === TimelineKind.VIEW ? parseViewArguments(argumentsText) : invalid(`expected auto, none, scroll(), view() or a dashed name such as --hero, found "${text}"`);
}

/** A timeline name (`scroll-timeline-name`, `view-timeline-name`): `none` or a dashed ident; null for the first. */
export function parseTimelineName(text: string) {
  const trimmed = text.trim();
  const isNone = trimmed.toLowerCase() === TimelineKind.NONE;
  if (isNone) {
    return valid(null);
  }

  return DASHED_IDENT.test(trimmed) ? valid(trimmed) : invalid(`expected none or a dashed name such as --hero, found "${text}"`);
}

function pointFrom({ tokens, isEnd }: {
  tokens: readonly string[];
  isEnd: boolean;
}) {
  const [first = "", second] = tokens;
  const isNormal = first.toLowerCase() === NORMAL && second === undefined;
  if (isNormal) {
    return valid(null);
  }

  const name = RANGE_NAMES.get(first.toLowerCase()) ?? null;
  const offsetToken = name === null ? first : second;
  const isOffsetWritten = offsetToken !== undefined;
  const wholeName = {
    pixels: 0,
    fraction: isEnd ? 1 : 0
  } satisfies Offset;
  const offset = isOffsetWritten ? parseOffset(offsetToken) : wholeName;
  const isExtra = name === null ? second !== undefined : tokens.length > 2;
  const isInvalid = offset === null || isExtra;
  if (isInvalid) {
    return invalid(`expected normal, a range name (${RANGE_WORDS}) and a length in px or a percentage, found "${tokens.join(" ")}"`);
  }

  return valid({
    name,
    offset
  });
}

/**
 * One end of `animation-range` (`animation-range-start` or `-end`): `normal`
 * (null) or `[name] [length | percentage]`; a name alone is the start (0%)
 * or the end (100%) of that part.
 */
export function parseRangePoint({ text, isEnd }: {
  text: string;
  isEnd: boolean;
}) {
  return pointFrom({
    tokens: splitWords(text),
    isEnd
  });
}

function isRangeName(word: string) {
  return RANGE_NAMES.has(word.toLowerCase());
}

/**
 * Splits the `animation-range` shorthand into the text of its start and end. A lone
 * range name means that whole part (`entry` is `entry 0% entry 100%`); a lone
 * offset starts there and ends at `normal`.
 */
export function splitRange(text: string) {
  const groups: string[][] = [];
  for (const word of splitWords(text)) {
    const last = groups.at(-1);
    const isOffsetOfName = !isRangeName(word) && word.toLowerCase() !== NORMAL && last?.length === 1 && isRangeName(last[0] ?? "");
    if (isOffsetOfName) {
      last.push(word);
    } else {
      groups.push([word]);
    }
  }

  const [startGroup, endGroup] = groups;
  const isCountValid = startGroup !== undefined && groups.length <= MAX_INSETS;
  if (!isCountValid) {
    return invalid(`expected a start and an end (normal, or a range name and a length or percentage), found "${text}"`);
  }

  const [startName = ""] = startGroup;
  const isNameOnly = startGroup.length === 1 && isRangeName(startName);
  return valid({
    start: startGroup.join(" "),
    end: endGroup?.join(" ") ?? (isNameOnly ? startName : NORMAL)
  });
}
