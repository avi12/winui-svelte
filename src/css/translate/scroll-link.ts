import { ExpressionKind, numberText, reference, scalar } from "#src/composition/expression.js";
import { RangeName, ScrollAxis } from "#src/css/parse/scroll-timeline.js";
import type {
  Offset,
  RangePoint,
  TimelineKind,
  TimelineRef,
  ViewInset
} from "#src/css/parse/scroll-timeline.js";

// The arithmetic of a scroll-linked animation, apart from WinUI so it runs
// under `node --test`: which scroll offsets an `animation-range` spans, and the
// Composition expressions that turn the scroll viewer's offset into the value
// of each animated property.

/** The composition properties a scroll-linked animation can drive, spelled as Composition names them. */
export const LinkedProperty = {
  OPACITY: "Opacity",
  TRANSLATION_X: "Translation.X",
  TRANSLATION_Y: "Translation.Y",
  SCALE_X: "Scale.X",
  SCALE_Y: "Scale.Y",
  ROTATION: "RotationAngleInDegrees"
} as const;

/** One of the properties in `LinkedProperty`. */
export type LinkedProperty = (typeof LinkedProperty)[keyof typeof LinkedProperty];

/** The value a property has when nothing sets it. */
export const RESTING_VALUES: ReadonlyMap<LinkedProperty, number> = new Map([
  [LinkedProperty.OPACITY, 1],
  [LinkedProperty.TRANSLATION_X, 0],
  [LinkedProperty.TRANSLATION_Y, 0],
  [LinkedProperty.SCALE_X, 1],
  [LinkedProperty.SCALE_Y, 1],
  [LinkedProperty.ROTATION, 0]
]);

/** The values one property takes along the animation, at offsets from 0 to 1 of its range. */
export interface LinkedTrack {
  readonly property: LinkedProperty;
  readonly frames: ReadonlyArray<{
    readonly offset: number;
    readonly value: number;
  }>;
}

/** What the scroll viewer and the subject measure, in pixels along the timeline's axis. */
export interface ScrollGeometry {
  /** The largest scroll offset: the extent minus the viewport. */
  readonly scrollExtent: number;
  /** The size of the viewport. */
  readonly viewport: number;
  /** For a view timeline, where the subject starts in the scrolled content and how big it is. */
  readonly subject: {
    readonly start: number;
    readonly size: number;
  } | null;
  readonly inset: ViewInset;
}

/** The names the expression refers to: the scroll viewer's manipulation property set and the link's own. */
export const ExpressionParameter = {
  SCROLLER: "scroller",
  LINK: "link"
} as const;

/** The scalar properties of the link's own property set. */
export const LinkProperty = {
  START: "Start",
  END: "End",
  PROGRESS: "Progress"
} as const;

const MIN_SPAN = 0.001;

function resolved({ offset, whole }: {
  offset: Offset;
  whole: number;
}) {
  return offset.pixels + offset.fraction * whole;
}

function insetPixels({ inset, viewport }: {
  inset: ViewInset["start"];
  viewport: number;
}) {
  return inset.isAuto ? 0 : resolved({
    offset: inset.offset,
    whole: viewport
  });
}

// The named parts of a view timeline as scroll offsets (the spec's view progress timeline).
function viewParts({ viewport, subject, inset }: Omit<ScrollGeometry, "scrollExtent"> & {
  subject: NonNullable<ScrollGeometry["subject"]>;
}) {
  const visibleStart = insetPixels({
    inset: inset.start,
    viewport
  });
  const visibleEnd = viewport - insetPixels({
    inset: inset.end,
    viewport
  });
  const isFitting = subject.size <= visibleEnd - visibleStart;
  const enters = subject.start - visibleEnd;
  const leaves = subject.start + subject.size - visibleStart;
  const containStart = isFitting ? subject.start + subject.size - visibleEnd : subject.start - visibleStart;
  const containEnd = isFitting ? subject.start - visibleStart : subject.start + subject.size - visibleEnd;
  return new Map<RangeName, readonly [number, number]>([
    [RangeName.COVER, [enters, leaves]],
    [RangeName.CONTAIN, [containStart, containEnd]],
    [RangeName.ENTRY, [enters, containStart]],
    [RangeName.EXIT, [containEnd, leaves]],
    [RangeName.ENTRY_CROSSING, [enters, subject.start + subject.size - visibleEnd]],
    [RangeName.EXIT_CROSSING, [subject.start - visibleStart, leaves]]
  ]);
}

function pointOffset({ point, parts, whole, isEnd }: {
  point: RangePoint | null;
  parts: ReadonlyMap<RangeName, readonly [number, number]> | null;
  whole: readonly [number, number];
  isEnd: boolean;
}) {
  const cover = parts?.get(RangeName.COVER) ?? whole;
  const isNormal = point === null;
  if (isNormal) {
    return isEnd ? cover[1] : cover[0];
  }

  const [low, high] = point.name === null ? cover : parts?.get(point.name) ?? cover;
  return low + resolved({
    offset: point.offset,
    whole: high - low
  });
}

/**
 * The scroll offsets an `animation-range` spans: the whole scroll range for a
 * scroll timeline, the cover range of the subject for a view timeline, or the
 * named part and offset each end writes.
 */
export function rangeOffsets({ geometry, start, end }: {
  geometry: ScrollGeometry;
  start: RangePoint | null;
  end: RangePoint | null;
}) {
  const whole = [0, geometry.scrollExtent] as const;
  const { subject } = geometry;
  const parts = subject === null ? null : viewParts({
    viewport: geometry.viewport,
    subject,
    inset: geometry.inset
  });
  const from = pointOffset({
    point: start,
    parts,
    whole,
    isEnd: false
  });
  const to = pointOffset({
    point: end,
    parts,
    whole,
    isEnd: true
  });
  return {
    start: from,
    end: Math.max(to, from + MIN_SPAN)
  };
}

// The scroll viewer's manipulation property set and the link's own, as
// expressions read them; the link binds both by name when it starts.
function scrollerReference() {
  return reference({
    name: ExpressionParameter.SCROLLER,
    members: {
      translation: ExpressionKind.VECTOR3
    }
  });
}

function linkReference() {
  return reference({
    name: ExpressionParameter.LINK,
    members: {
      [LinkProperty.START]: ExpressionKind.SCALAR,
      [LinkProperty.END]: ExpressionKind.SCALAR,
      [LinkProperty.PROGRESS]: ExpressionKind.SCALAR
    }
  });
}

/**
 * The expression of the link's `Progress` (0 to 1 over the animation range):
 * the scroll viewer's offset, which is the negative of its manipulation
 * property set's translation, between the link's `Start` and `End`, clamped.
 * A reversed animation counts down instead.
 */
export function progressExpression({ axis, isReversed }: {
  axis: ScrollAxis;
  isReversed: boolean;
}) {
  const { translation } = scrollerReference();
  const link = linkReference();
  const start = link[LinkProperty.START];
  const offset = (axis === ScrollAxis.HORIZONTAL ? translation.x : translation.y).negated();
  const progress = offset.minus(start).dividedBy(link[LinkProperty.END].minus(start)).clamped({
    min: 0,
    max: 1
  });
  return isReversed ? scalar(1).minus(progress).text : progress.text;
}

/**
 * The expression of one animated property: its key frames as straight
 * segments over the link's `Progress`, a `Lerp` for each, clamped so that the
 * first and last value hold outside their offsets. A track that starts after
 * offset 0 or ends before 1 holds `underlying` (the element's own value) there.
 */
export function trackExpression({ track, underlying }: {
  track: LinkedTrack;
  underlying: number;
}) {
  const frames = [...track.frames].sort((first, second) => first.offset - second.offset);
  const [first] = frames;
  const last = frames.at(-1);
  const isStartLate = first !== undefined && first.offset > 0;
  const isEndEarly = last !== undefined && last.offset < 1;
  const points = [
    ...isStartLate ? [{
      offset: 0,
      value: underlying
    }] : [],
    ...frames,
    ...isEndEarly ? [{
      offset: 1,
      value: underlying
    }] : []
  ];
  const progress = linkReference()[LinkProperty.PROGRESS];
  const segments = points.slice(1).map((point, i) => {
    const previous = points[i];
    const from = previous?.value ?? 0;
    const span = point.offset - (previous?.offset ?? 0);
    const isFirst = i === 0;
    const amount = progress.minus(previous?.offset ?? 0).dividedBy(Math.max(span, MIN_SPAN)).clamped({
      min: 0,
      max: 1
    });
    return scalar(isFirst ? from : 0).lerp({
      to: isFirst ? point.value : point.value - from,
      amount
    });
  });
  const [head, ...rest] = segments;
  const isEmpty = head === undefined;
  if (isEmpty) {
    return numberText(underlying);
  }

  let sum = head;
  for (const segment of rest) {
    sum = sum.plus(segment);
  }

  return sum.text;
}

/** One animation linked to a scroll or view timeline, resolved by the build. */
export interface LinkedAnimation {
  readonly timeline: Exclude<TimelineRef, { readonly kind: typeof TimelineKind.AUTO | typeof TimelineKind.NONE }>;
  readonly start: RangePoint | null;
  readonly end: RangePoint | null;
  readonly isReversed: boolean;
  readonly tracks: readonly LinkedTrack[];
}

/** A timeline an element defines for its descendants: `scroll-timeline-name` or `view-timeline-name`. */
export interface TimelineDefinition {
  readonly name: string;
  readonly kind: typeof TimelineKind.SCROLL | typeof TimelineKind.VIEW;
  readonly axis: ScrollAxis;
  readonly inset: ViewInset;
}

// What the build lowered, by the text the write carries: the write is a string,
// and the runtime that applies it is the one that lowered it.
const linkedByText = new Map<string, readonly LinkedAnimation[]>();
const definitionByText = new Map<string, TimelineDefinition>();

/** The write value for the animations linked to timelines. */
export function writeLinked(links: readonly LinkedAnimation[]) {
  const text = JSON.stringify(links);
  linkedByText.set(text, links);
  return text;
}

/** The animations a `writeLinked` value stands for. */
export function readLinked(text: string) {
  return linkedByText.get(text) ?? [];
}

/** The write value for a timeline definition. */
export function writeDefinition(definition: TimelineDefinition) {
  const text = JSON.stringify(definition);
  definitionByText.set(text, definition);
  return text;
}

/** The definition a `writeDefinition` value stands for. */
export function readDefinition(text: string) {
  return definitionByText.get(text) ?? null;
}
