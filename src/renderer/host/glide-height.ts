import { nativeControl } from "./control.ts";
import { isRecord, read } from "./reflect.ts";
import type { NativeValue } from "#src/native-value.js";

const DEFAULT_DURATION_MILLISECONDS = 200;
const DEFAULT_EASING = "ease-out";
// A change smaller than this is rounding, not content.
const MINIMUM_CHANGE = 0.5;
const NEEDS_ANIMATION = "glideHeight needs element animation: call enableElementAnimation() once, "
  + "or use a transition: directive in the app";

/** What `glideHeight` can be told; every member has a default. */
export interface GlideHeightOptions {
  /** Default: 200. */
  readonly duration?: number;

  /** A CSS easing; default: `ease-out`. */
  readonly easing?: string;
}

interface Glidable {
  readonly actualHeight: number;
  onSizeChanged(listener: () => void): () => void;
}

interface Glide {
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
  cancel(): void;
}

function isGlidable(value: NativeValue): value is Glidable {
  return isRecord(value) && typeof value["actualHeight"] === "number" && typeof value["onSizeChanged"] === "function";
}

function isMethod(value: NativeValue): value is (...values: NativeValue[]) => NativeValue {
  return typeof value === "function";
}

function isGlide(value: NativeValue): value is Glide {
  return isRecord(value) && typeof value["cancel"] === "function";
}

function animateOf(node: object) {
  const animate = read(node, "animate");
  if (!isMethod(animate)) {
    throw new TypeError(NEEDS_ANIMATION);
  }

  return (keyframes: NativeValue, options: NativeValue) => {
    const glide = animate.call(node, keyframes, options);
    return isGlide(glide) ? glide : null;
  };
}

function startGliding({ node, element, duration, easing }: {
  node: object;
  element: Glidable;
  duration: number;
  easing: string;
}) {
  const animate = animateOf(node);
  let shown = element.actualHeight;
  let running: Glide | null = null;

  function follow() {
    const next = element.actualHeight;
    const from = shown;
    shown = next;
    const isFirstLayout = from <= 0;
    const isUnchanged = Math.abs(next - from) < MINIMUM_CHANGE;
    const isGlideNeeded = !isFirstLayout && !isUnchanged;
    if (!isGlideNeeded) {
      return;
    }

    const glide = animate([{ height: `${from}px` }, { height: `${next}px` }], {
      duration,
      easing
    });
    running = glide;
    const isGlideMade = glide !== null;
    if (!isGlideMade) {
      return;
    }

    function end() {
      const isCurrent = running === glide;
      if (isCurrent) {
        running = null;
        follow();
      }
    }
    glide.onfinish = end;
    glide.oncancel = end;
  }

  const stop = element.onSizeChanged(() => {
    const isGliding = running !== null;
    if (!isGliding) {
      follow();
    }
  });
  return () => {
    stop();
    const glide = running;
    running = null;
    glide?.cancel();
  };
}

/**
 * Makes an element glide to its new height when its content grows or shrinks,
 * where WinUI cannot animate `Height="Auto"`: what a `ResizeObserver` and
 * `element.animate({ height })` do on the web. Put it after `@attach` on the
 * element whose height follows its content (`@attach glideHeight()`).
 *
 * The element lays out at its new height at once; the glide then runs the
 * `Height` from the old size to the new through the web's `element.animate`, and
 * gives `Auto` back when it ends, so a change during the glide is picked up
 * afterwards. The first layout does not glide. An element with a fixed `height`
 * never changes size by itself, so there is nothing to glide. Content that
 * would show outside a shrinking element is clipped only if the element clips
 * (a `Border` with `clip-to-bounds`, a `ScrollViewer`), and the user's reduced
 * motion setting makes the change instant, as for every animation.
 *
 * @param options - Duration and easing; defaults 200 milliseconds and `ease-out`.
 * @returns The attachment to put after `@attach`.
 */
export function glideHeight({
  duration = DEFAULT_DURATION_MILLISECONDS,
  easing = DEFAULT_EASING
}: GlideHeightOptions = {}) {
  return (node: object) => {
    const element = nativeControl(node);
    if (!isGlidable(element)) {
      return;
    }

    return startGliding({
      node,
      element,
      duration,
      easing
    });
  };
}
