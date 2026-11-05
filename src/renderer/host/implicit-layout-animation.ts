import { nativeControl } from "./control.ts";
import { read } from "./reflect.ts";
import { timeSpanOf } from "#src/components/convert.js";
import { parseEasing } from "#src/css/translate/easing.js";
import type { NativeValue } from "#src/native-value.js";
import { isMotionReducedBySystem } from "#src/window/reduced-motion.js";
import { systemSettingsStore } from "#src/window/settings-store.js";
import type { Compositor } from "#winui/microsoft/ui/composition/Compositor";
import type {
  CompositionImplicitAnimationCollection
} from "#winui/microsoft/ui/composition/ImplicitAnimationCollection";
import type { Visual } from "#winui/microsoft/ui/composition/Visual";
import { ElementCompositionPreview } from "#winui/microsoft/ui/xaml/hosting/ElementCompositionPreview";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";

const DEFAULT_DURATION_MILLISECONDS = 260;
const OFFSET_PROPERTY = "Offset";
const FINAL_VALUE = "this.FinalValue";
const END_OF_ANIMATION = 1;

/** The curves an implicit layout animation can follow. */
export const LayoutEasing = {
  EASE: "ease",
  EASE_IN: "ease-in",
  EASE_OUT: "ease-out",
  EASE_IN_OUT: "ease-in-out",
  LINEAR: "linear",
  EMPHASIZED: "cubic-bezier(0.05, 0.7, 0.1, 1)"
} as const;

/** One of the values of `LayoutEasing`. */
export type LayoutEasing = typeof LayoutEasing[keyof typeof LayoutEasing];

/** What `implicitLayoutAnimation` can be told; every member has a default. */
export interface ImplicitLayoutAnimationOptions {
  /** Milliseconds; default: 260, the length Windows' own settings pages slide with. */
  readonly duration?: number;

  /** Default: `LayoutEasing.EASE_OUT`. */
  readonly easing?: LayoutEasing;

  /** What the animation reads of the system; default: the real one, a test replaces it. */
  readonly host?: ImplicitLayoutHost;
}

/**
 * What the animation needs of the system, which a test replaces: the visual
 * of an element, and whether the user asked for reduced motion (with a way to
 * hear it change).
 */
export interface ImplicitLayoutHost {
  visualOf(element: UIElement): Pick<Visual, "compositor" | "implicitAnimations">;
  isMotionReduced(): boolean;
  onMotionChanged(callback: () => void): () => void;
}

interface Container {
  readonly children: Iterable<UIElement>;
  onLayoutUpdated(listener: () => void): () => void;
}

const systemHost = {
  visualOf: element => ElementCompositionPreview.getElementVisual(element),
  isMotionReduced: isMotionReducedBySystem,
  onMotionChanged: callback => systemSettingsStore().subscribe(callback)
} satisfies ImplicitLayoutHost;

function isContainer(value: NativeValue): value is NativeValue & Container {
  const children = read(value, "children");
  const isIterable = typeof children === "object" && children !== null && Symbol.iterator in children;
  return isIterable && typeof read(value, "onLayoutUpdated") === "function";
}

function offsetCollection({ compositor, duration, easing }: {
  compositor: Compositor;
  duration: number;
  easing: LayoutEasing;
}) {
  const curve = parseEasing(easing);
  const isBezier = curve?.kind === "bezier";
  const animation = compositor.createVector3KeyFrameAnimation();
  animation.target = OFFSET_PROPERTY;
  animation.duration = timeSpanOf(duration);

  if (isBezier) {
    animation.insertExpressionKeyFrame(
      END_OF_ANIMATION, FINAL_VALUE, compositor.createCubicBezierEasingFunction(
        {
          x: curve.x1,
          y: curve.y1
        }, {
          x: curve.x2,
          y: curve.y2
        }
      )
    );
  } else {
    animation.insertExpressionKeyFrame(END_OF_ANIMATION, FINAL_VALUE);
  }

  const collection = compositor.createImplicitAnimationCollection();
  collection.insert(OFFSET_PROPERTY, animation);
  return collection;
}

function start({ container, host, duration, easing }: {
  container: Container;
  host: ImplicitLayoutHost;
  duration: number;
  easing: LayoutEasing;
}) {
  const animated = new Set<UIElement>();
  let collection: CompositionImplicitAnimationCollection | null = null;

  function release() {
    collection?.clear();
    collection = null;
    animated.clear();
  }

  function follow() {
    const isReduced = host.isMotionReduced();
    if (isReduced) {
      release();
      return;
    }

    for (const child of container.children) {
      const isKnown = animated.has(child);
      if (isKnown) {
        continue;
      }

      const visual = host.visualOf(child);
      collection ??= offsetCollection({
        compositor: visual.compositor,
        duration,
        easing
      });
      visual.implicitAnimations = collection;
      animated.add(child);
    }
  }

  follow();
  const stops = [container.onLayoutUpdated(follow), host.onMotionChanged(follow)];
  return () => {
    for (const stop of stops) {
      stop();
    }

    release();
  };
}

/**
 * Makes the children of a panel slide to their new places instead of jumping
 * when the layout moves them (an expander above them opens, an item is
 * removed): the animation WinUI runs on a visual's `Offset` property, started
 * by the composition layer itself whenever the offset changes. Put it on the
 * panel whose children move: `@attach implicitLayoutAnimation({ duration: 260 })`.
 *
 * A child gets the animation when the panel first lays it out after it was
 * added, so an item that appears does not slide in from the corner, and the
 * ones already there slide over to make room. A user who turned Windows'
 * animation effects off gets the plain jump, and the slide returns if they turn
 * them back on.
 *
 * @param options - Duration and easing.
 * @returns The attachment to put after `@attach`.
 */
export function implicitLayoutAnimation({
  duration = DEFAULT_DURATION_MILLISECONDS,
  easing = LayoutEasing.EASE_OUT,
  host = systemHost
}: ImplicitLayoutAnimationOptions = {}) {
  return (node: object) => {
    const container = nativeControl(node);
    if (!isContainer(container)) {
      return;
    }

    return start({
      container,
      host,
      duration,
      easing
    });
  };
}
