import { normalizeKeyframes } from "./animations.ts";
import type { KeyframeInput } from "./animations.ts";
import { DomErrorName, domException } from "./dom-exception.ts";
import { defineProperty } from "./install.ts";
import {
  parseAxis,
  parseRangePoint,
  parseViewInset,
  ScrollAxis,
  Scroller,
  TimelineKind
} from "#src/css/parse/scroll-timeline.js";
import type { ViewInset } from "#src/css/parse/scroll-timeline.js";
import { tracksOf } from "#src/css/translate/animation-tracks.js";
import { isLinear, parseEasing } from "#src/css/translate/easing.js";
import { linkedTracksOf } from "#src/css/translate/linked-tracks.js";
import { rangeOffsets } from "#src/css/translate/scroll-link.js";
import type { LinkedAnimation } from "#src/css/translate/scroll-link.js";
import { nativeControl } from "#src/renderer/host/control.js";
import { isMotionReducedFor } from "#src/renderer/host/element-animation.js";
import { read } from "#src/renderer/host/reflect.js";
import { ElementNode } from "#src/renderer/tree/dom.js";
import { isFrameworkElement } from "#src/win2d/element-guard.js";
import { nearestScrollViewer } from "#src/win2d/scroll-host.js";
import { linkScroll, scrollGeometry, scrollOffset } from "#src/win2d/scroll-link.js";
import { releaseProjected } from "#winui/lifetime";
import type { ScrollViewer } from "#winui/microsoft/ui/xaml/controls/ScrollViewer";
import type { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";

// `ScrollTimeline` and `ViewTimeline` of the web, over Composition: a timeline
// reads a WinUI scroll viewer, and `element.animate(keyframes, { timeline })`
// links the element's opacity, translation, scale and rotation to it, the way
// `animation-timeline` does in CSS (src/win2d/scroll-link.ts).

const PERCENT = 100;
const FULL = 1;
const NO_INSET: ViewInset = {
  start: {
    isAuto: true,
    offset: {
      pixels: 0,
      fraction: 0
    }
  },
  end: {
    isAuto: true,
    offset: {
      pixels: 0,
      fraction: 0
    }
  }
};
const KEYFRAME_FIELDS = new Set(["offset", "easing", "composite"]);
const REVERSE = "reverse";
const AUTO = "auto";

/** A progress as the web's `CSSUnitValue` gives it: a number with its unit, here always `percent`. */
export interface TimelineProgress {
  readonly value: number;
  readonly unit: "percent";
}

/** The options of `new ScrollTimeline()`. */
export interface ScrollTimelineOptions {
  /** The element that scrolls: a `<scroll-viewer>`; without one the timeline is inactive. */
  readonly source?: object | null;
  /** `block` or `y` (vertical, the default), `inline` or `x` (horizontal). */
  readonly axis?: string;
}

/** The options of `new ViewTimeline()`. */
export interface ViewTimelineOptions {
  /** The element whose passage through its scroll viewer the timeline measures. */
  readonly subject: object;
  readonly axis?: string;
  /** Where the scrollport starts and ends, `auto` or lengths in px or percentages: `"10px"`, `["10px", "20%"]`. */
  readonly inset?: string | readonly string[];
}

/** What `element.animate()` adds to the web's timing for a scroll-linked animation. */
export interface ScrollTimingOptions {
  readonly timeline?: ScrollTimeline | null;
  /** Where the animation starts in the timeline: `normal`, a percentage, or a range name and offset (`"entry 10%"`). */
  readonly rangeStart?: string;
  readonly rangeEnd?: string;
  readonly direction?: string;
  readonly easing?: string;
  readonly iterations?: number;
  readonly id?: string;
}

/** What `installScrollTimeline` takes. */
export interface ScrollTimelineInstallOptions {
  /** Whether the user asked for reduced motion, which stops an animation from starting; default: Windows' setting. */
  readonly isMotionReduced?: () => boolean;
}

function invalidAxis(axis: string) {
  return new TypeError(`axis must be block, inline, x or y, found "${axis}"`);
}

function axisOf(word: string | undefined) {
  const isDefault = word === undefined;
  if (isDefault) {
    return ScrollAxis.VERTICAL;
  }

  const axis = parseAxis(word);
  const isInvalid = axis === null;
  if (isInvalid) {
    throw invalidAxis(word);
  }

  return axis;
}

function isScrollViewer(value: unknown): value is ScrollViewer {
  const isObject = typeof value === "object" && value !== null;
  return isObject && "changeView" in value && "scrollableHeight" in value;
}

/** The WinUI side of a timeline: its scroll viewer and axis, and for a view timeline the subject and inset. */
export interface ScrollTimelineLink {
  readonly scroller: ScrollViewer;
  readonly axis: ScrollAxis;
  readonly subject: FrameworkElement | null;
  readonly inset: ViewInset;
}

function linkOf(link: ScrollTimelineLink) {
  return link;
}

function percentOf(fraction: number) {
  const clamped = Math.min(Math.max(fraction, 0), FULL);
  return {
    value: clamped * PERCENT,
    unit: "percent"
  } satisfies TimelineProgress;
}

/**
 * A timeline whose time is how far a scroll viewer is scrolled: `currentTime`
 * is a percentage of its scrollable range (null while the source is no scroll
 * viewer or is not in a window yet).
 */
export class ScrollTimeline {
  readonly axis: string;
  protected readonly scrollAxis: ScrollAxis;
  private readonly ownSource: object | null;

  constructor(options: ScrollTimelineOptions = {}) {
    this.scrollAxis = axisOf(options.axis);
    this.axis = options.axis ?? "block";
    this.ownSource = options.source ?? null;
  }

  /** The element that scrolls. */
  get source() {
    return this.ownSource;
  }

  /** How far the source is scrolled, as a percentage of its range. */
  get currentTime() {
    const control = this.sourceControl();
    if (!isScrollViewer(control)) {
      return null;
    }

    const { scrollExtent } = scrollGeometry({
      scroller: control,
      link: {
        axis: this.scrollAxis,
        inset: NO_INSET,
        subject: null
      }
    });
    const offset = scrollOffset({
      scroller: control,
      axis: this.scrollAxis
    });
    return percentOf(scrollExtent > 0 ? offset / scrollExtent : 0);
  }

  /** The timeline's duration: always 100 percent. */
  get duration() {
    return percentOf(FULL);
  }

  /** The native scroll viewer the timeline reads, or null. */
  protected sourceControl() {
    return this.ownSource === null ? null : nativeControl(this.ownSource);
  }

  /** The WinUI side of the timeline, for `animate()`: the scroll viewer, the axis, the subject and the inset. */
  nativeLink() {
    const control = this.sourceControl();
    return isScrollViewer(control) ? linkOf({
      scroller: control,
      axis: this.scrollAxis,
      subject: null,
      inset: NO_INSET
    }) : null;
  }
}

/**
 * A timeline whose time is how far its subject has crossed the scroll viewer
 * it is in, from entering the viewport (0 percent) to leaving it (100 percent).
 */
export class ViewTimeline extends ScrollTimeline {
  private readonly subjectNode: object;
  private readonly viewInset: ViewInset;

  constructor(options: ViewTimelineOptions) {
    super(options.axis === undefined ? {} : { axis: options.axis });
    this.subjectNode = options.subject;
    const insetText = [options.inset ?? []].flat().join(" ");
    const parsed = parseViewInset(insetText === "" ? AUTO : insetText);
    if (!parsed.isValid) {
      throw new TypeError(`inset: ${parsed.reason}`);
    }

    this.viewInset = parsed.value;
  }

  /** The element that crosses the viewport. */
  get subject() {
    return this.subjectNode;
  }

  override get currentTime() {
    const link = this.nativeLink();
    const isUnlinked = link === null;
    if (isUnlinked) {
      return null;
    }

    const range = rangeOffsets({
      geometry: scrollGeometry({
        scroller: link.scroller,
        link
      }),
      start: null,
      end: null
    });
    const offset = scrollOffset({
      scroller: link.scroller,
      axis: link.axis
    });
    return percentOf((offset - range.start) / (range.end - range.start));
  }

  override nativeLink() {
    const subject = nativeControl(this.subjectNode);
    const scroller = isFrameworkElement(subject) ? nearestScrollViewer(subject) : null;
    const isLinked = scroller !== null && isFrameworkElement(subject);
    return isLinked ? linkOf({
      scroller,
      axis: this.scrollAxis,
      subject,
      inset: this.viewInset
    }) : null;
  }
}

/** What `element.animate()` returns for a scroll-linked animation. */
export class ScrollLinkedAnimation {
  readonly timeline: ScrollTimeline;
  readonly target: object;
  id = "";
  private unlink: (() => void) | null;

  constructor({ timeline, target, unlink }: {
    timeline: ScrollTimeline;
    target: object;
    unlink: (() => void) | null;
  }) {
    this.timeline = timeline;
    this.target = target;
    this.unlink = unlink;
  }

  /** `running` while the element follows the timeline, `idle` once cancelled or if it never started. */
  get playState() {
    return this.unlink === null ? "idle" : "running";
  }

  /** Stops following the timeline and puts the element's own values back. */
  cancel() {
    this.unlink?.();
    this.unlink = null;
  }
}

function notSupported(message: string) {
  return domException({
    name: DomErrorName.NOT_SUPPORTED,
    message
  });
}

function kebab(property: string) {
  return property.replaceAll(/[A-Z]/gu, letter => `-${letter.toLowerCase()}`);
}

// The keyframes in the shape the CSS build reads, so the same rules say what Composition can drive.
function keyframesData(input: KeyframeInput) {
  const frames = normalizeKeyframes(input);
  const last = Math.max(frames.length - 1, 1);
  return {
    name: "animate()",
    steps: frames.map((frame, i) => {
      const offset = typeof frame["offset"] === "number" ? frame["offset"] : i / last;
      const fields = Object.entries(frame);
      const declared = fields.filter(([property, value]) => !KEYFRAME_FIELDS.has(property) && value != null);
      return {
        offset,
        declarations: declared.map(([property, value]) => ({
          property: kebab(property),
          value: String(value),
          isImportant: false,
          at: {
            line: 1,
            column: 1
          }
        }))
      };
    })
  };
}

function rangePoint({ text, isEnd }: {
  text: string | undefined;
  isEnd: boolean;
}) {
  const isMissing = text === undefined;
  if (isMissing) {
    return null;
  }

  const parsed = parseRangePoint({
    text,
    isEnd
  });
  if (!parsed.isValid) {
    throw new TypeError(parsed.reason);
  }

  return parsed.value;
}

function checkTiming(options: ScrollTimingOptions) {
  const easing = options.easing === undefined ? null : parseEasing(options.easing);
  const isEasingLinear = options.easing === undefined || easing !== null && isLinear(easing);
  if (!isEasingLinear) {
    throw notSupported("a scroll-linked animation maps the scroll position straight onto its keyframes; use easing: \"linear\"");
  }

  const isOnce = options.iterations === undefined || options.iterations === 1;
  if (!isOnce) {
    throw notSupported("a scroll-linked animation runs once across its range; iterations must be 1");
  }
}

// The tracks Composition can drive, or a NotSupportedError that says which keyframes it cannot.
function linkedTracksFor(keyframes: KeyframeInput) {
  const problems: string[] = [];
  const tracks = tracksOf({
    keyframes: keyframesData(keyframes),
    report: ({ message }) => problems.push(message)
  });
  const { linked, unsupported } = linkedTracksOf(tracks ?? []);
  const hasProblems = problems.length > 0 || unsupported.length > 0;
  if (hasProblems) {
    throw notSupported(problems.join("; ") || `${unsupported.join(", ")} cannot be driven from a scroll position (opacity, translate, scale and rotate can)`);
  }

  return linked;
}

function linkedAnimationOf({ tracks, options, link }: {
  tracks: LinkedAnimation["tracks"];
  options: ScrollTimingOptions;
  link: ScrollTimelineLink;
}) {
  const isScroll = link.subject === null;
  return {
    timeline: isScroll ? {
      kind: TimelineKind.SCROLL,
      scroller: Scroller.NEAREST,
      axis: link.axis
    } : {
      kind: TimelineKind.VIEW,
      axis: link.axis,
      inset: link.inset
    },
    start: rangePoint({
      text: options.rangeStart,
      isEnd: false
    }),
    end: rangePoint({
      text: options.rangeEnd,
      isEnd: true
    }),
    isReversed: options.direction === REVERSE,
    tracks
  } satisfies LinkedAnimation;
}

function animateOnTimeline({ node, keyframes, options, timeline }: {
  node: object;
  keyframes: KeyframeInput;
  options: ScrollTimingOptions;
  timeline: ScrollTimeline;
}) {
  checkTiming(options);
  const tracks = linkedTracksFor(keyframes);
  const target = nativeControl(node);
  const link = timeline.nativeLink();
  const isLinkable = isFrameworkElement(target) && link !== null;
  if (!isLinkable) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "The element and the timeline's scroll viewer must be in a window"
    });
  }

  const animation = linkedAnimationOf({
    tracks,
    options,
    link
  });
  const unlinkScroll = linkScroll({
    target,
    scroller: link.scroller,
    links: [{
      animation,
      axis: link.axis,
      inset: link.inset,
      subject: link.subject
    }]
  });
  return new ScrollLinkedAnimation({
    timeline,
    target: node,
    unlink() {
      unlinkScroll();
      releaseProjected(link.scroller);
    }
  });
}

function isTimelineOptions(value: unknown): value is ScrollTimingOptions {
  return typeof value === "object" && value !== null;
}

function defineAnimate({ previous, isMotionReduced }: {
  previous: (this: object, keyframes: KeyframeInput, options?: unknown) => unknown;
  isMotionReduced: ScrollTimelineInstallOptions["isMotionReduced"];
}) {
  return function animate(this: object, keyframes: KeyframeInput, options?: unknown) {
    const timeline = isTimelineOptions(options) ? options.timeline : null;
    const isLinked = timeline instanceof ScrollTimeline && isTimelineOptions(options);
    if (!isLinked) {
      return previous.call(this, keyframes, options);
    }

    const isSkipped = isMotionReducedFor({
      node: this,
      ...isMotionReduced === undefined ? {} : { isMotionReduced }
    });
    if (isSkipped) {
      return new ScrollLinkedAnimation({
        timeline,
        target: this,
        unlink: null
      });
    }

    return animateOnTimeline({
      node: this,
      keyframes,
      options,
      timeline
    });
  };
}

type AnimateMethod = (this: object, keyframes: KeyframeInput, options?: unknown) => unknown;

function isAnimateMethod(value: unknown): value is AnimateMethod {
  return typeof value === "function";
}

/**
 * Gives the tree's elements scroll timelines: `ScrollTimeline` and
 * `ViewTimeline` are defined on the global scope, and
 * `element.animate(keyframes, { timeline })` links the element to the timeline
 * instead of to the clock. The element's opacity, translation, scale and
 * rotation follow the scroll viewer on the compositor (the same Composition
 * expressions as CSS's `animation-timeline`), with the keyframes spaced by
 * their `offset` and `rangeStart` and `rangeEnd` choosing the part of the
 * timeline they span. Width, height, colors and the rest are refused with a
 * `NotSupportedError`; so are an easing other than `linear` and more than one
 * iteration. The animation `animate()` returns has `timeline`, `playState`
 * and `cancel()`. Under reduced motion the animation does not start. A call
 * without a timeline goes on to whatever `animate` was before (install
 * `installAnimations` first for the Web Animations API). Install this only
 * when the app uses a scroll timeline: it is not part of `installWebApis`.
 *
 * @param options - Where the reduced-motion setting comes from, for a test.
 * @returns A function that puts the elements back as they were.
 */
export function installScrollTimeline(options: ScrollTimelineInstallOptions = {}) {
  const previous = read(ElementNode.prototype, "animate");
  if (!isAnimateMethod(previous)) {
    throw new Error("install the element animation engine first: call installAnimations() or enableElementAnimation()");
  }

  const restores = [
    defineProperty({
      name: "animate",
      target: ElementNode.prototype,
      value: defineAnimate({
        previous,
        isMotionReduced: options.isMotionReduced
      })
    }),
    defineProperty({
      name: "ScrollTimeline",
      value: ScrollTimeline
    }),
    defineProperty({
      name: "ViewTimeline",
      value: ViewTimeline
    })
  ];
  return () => {
    for (const restore of restores.reverse()) {
      restore();
    }
  };
}
