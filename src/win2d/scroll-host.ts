import { isFrameworkElement } from "./element-guard.ts";
import { linkScroll } from "./scroll-link.ts";
import type { ResolvedLink } from "./scroll-link.ts";
import { Scroller, TimelineKind } from "#src/css/parse/scroll-timeline.js";
import type { ViewInset } from "#src/css/parse/scroll-timeline.js";
import type { LinkedAnimation, TimelineDefinition } from "#src/css/translate/scroll-link.js";
import type { ScrollHost } from "#src/css/translate/scroll-timeline-properties.js";
import { projectAs, releaseProjected } from "#winui/lifetime";
import type { ProjectedType } from "#winui/lifetime";
import { ScrollViewer } from "#winui/microsoft/ui/xaml/controls/ScrollViewer";
import { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";
import { ElementCompositionPreview } from "#winui/microsoft/ui/xaml/hosting/ElementCompositionPreview";
import { VisualTreeHelper } from "#winui/microsoft/ui/xaml/media/VisualTreeHelper";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";

// What `scroll-timeline`, `view-timeline` and `animation-timeline` mean in a
// window: finding the scroll viewer and the subject an animation's timeline
// measures, and linking the animation to them (scroll-link.ts).
//
// A timeline an element defines is written into its visual's property set as a
// number that names the definition, since the wrappers a walk up the tree
// gives are never the object the CSS runtime holds, so elements cannot be
// compared; the property set is the one thing both reach.

const DEFINITION_PREFIX = "timeline";
const NOT_DEFINED = 0;
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

const definitions = new Map<number, TimelineDefinition>();
const waiting = new Set<() => void>();
let lastDefinitionId = 0;

function elementOf(control: object) {
  if (!isFrameworkElement(control)) {
    throw new TypeError("scroll-driven animation applies to a FrameworkElement");
  }

  return control;
}

function projectedOrNull<Instance extends object>({ value, type }: {
  value: unknown;
  type: ProjectedType<Instance>;
}) {
  try {
    return projectAs(value, type);
  } catch {
    return null;
  }
}

function asScrollViewer(element: UIElement) {
  return projectedOrNull({
    value: element,
    type: ScrollViewer
  });
}

// The element's ancestors, nearest first; each is a projection to release.
function ancestorsOf(element: FrameworkElement) {
  const found: FrameworkElement[] = [];
  let current: UIElement | null = element;
  while (current !== null) {
    const parent = VisualTreeHelper.getParent(current);
    const isParentMissing = parent === null || parent === undefined;
    const projected = isParentMissing ? null : projectedOrNull({
      value: parent,
      type: FrameworkElement
    });
    const isFound = projected !== null;
    if (isFound) {
      found.push(projected);
    }

    current = projected;
  }

  return found;
}

function definitionOf({ element, name }: {
  element: FrameworkElement;
  name: string;
}) {
  const [id, status] = ElementCompositionPreview.getElementVisual(element).properties.tryGetScalar(`${DEFINITION_PREFIX}${name}`);
  const isDefined = status === 0 && id !== NOT_DEFINED;
  return isDefined ? definitions.get(id) ?? null : null;
}

// The nearest scroll viewer among the ancestors (or the farthest, for `root`).
function scrollerAmong({ ancestors, scroller }: {
  ancestors: readonly FrameworkElement[];
  scroller: Scroller;
}) {
  const isRoot = scroller === Scroller.ROOT;
  const ordered = isRoot ? ancestors.toReversed() : ancestors;
  for (const ancestor of ordered) {
    const viewer = asScrollViewer(ancestor);
    const isViewer = viewer !== null;
    if (isViewer) {
      return viewer;
    }
  }

  return null;
}

interface Resolution {
  readonly scroller: ScrollViewer;
  readonly link: ResolvedLink;
}

function resolveScroll({ control, animation, timeline }: {
  control: FrameworkElement;
  animation: LinkedAnimation;
  timeline: Extract<LinkedAnimation["timeline"], { kind: typeof TimelineKind.SCROLL }>;
}) {
  const isSelf = timeline.scroller === "self";
  const scroller = isSelf ? asScrollViewer(control) : scrollerAmong({
    ancestors: ancestorsOf(control),
    scroller: timeline.scroller
  });
  return scroller === null ? null : {
    scroller,
    link: {
      animation,
      axis: timeline.axis,
      inset: NO_INSET,
      subject: null
    }
  } satisfies Resolution;
}

function resolveView({ control, animation, timeline }: {
  control: FrameworkElement;
  animation: LinkedAnimation;
  timeline: Extract<LinkedAnimation["timeline"], { kind: typeof TimelineKind.VIEW }>;
}) {
  const scroller = scrollerAmong({
    ancestors: ancestorsOf(control),
    scroller: Scroller.NEAREST
  });
  return scroller === null ? null : {
    scroller,
    link: {
      animation,
      axis: timeline.axis,
      inset: timeline.inset,
      subject: control
    }
  } satisfies Resolution;
}

function resolveNamed({ control, animation, name }: {
  control: FrameworkElement;
  animation: LinkedAnimation;
  name: string;
}) {
  const chain = [control, ...ancestorsOf(control)];
  for (const [i, element] of chain.entries()) {
    const definition = definitionOf({
      element,
      name
    });
    const isUndefined = definition === null;
    if (isUndefined) {
      continue;
    }

    const isScroll = definition.kind === TimelineKind.SCROLL;
    const scroller = isScroll ? asScrollViewer(element) : scrollerAmong({
      ancestors: chain.slice(i + 1),
      scroller: Scroller.NEAREST
    });
    return scroller === null ? null : {
      scroller,
      link: {
        animation,
        axis: definition.axis,
        inset: definition.inset,
        subject: isScroll ? null : element
      }
    } satisfies Resolution;
  }

  return null;
}

function resolve({ control, animation }: {
  control: FrameworkElement;
  animation: LinkedAnimation;
}) {
  const { timeline } = animation;
  const isScroll = timeline.kind === TimelineKind.SCROLL;
  if (isScroll) {
    return resolveScroll({
      control,
      animation,
      timeline
    });
  }

  const isView = timeline.kind === TimelineKind.VIEW;
  if (isView) {
    return resolveView({
      control,
      animation,
      timeline
    });
  }

  return resolveNamed({
    control,
    animation,
    name: timeline.name
  });
}

function linkAnimations({ control, animations }: {
  control: FrameworkElement;
  animations: readonly LinkedAnimation[];
}) {
  const unlinks = new Map<LinkedAnimation, () => void>();
  function attempt() {
    const isLoaded = control.isLoaded;
    if (!isLoaded) {
      return;
    }

    for (const animation of animations.filter(each => !unlinks.has(each))) {
      const resolution = resolve({
        control,
        animation
      });
      const isResolved = resolution !== null;
      if (isResolved) {
        const unlink = linkScroll({
          target: control,
          scroller: resolution.scroller,
          links: [resolution.link]
        });
        unlinks.set(animation, () => {
          unlink();
          releaseProjected(resolution.scroller);
        });
      }
    }
  }

  attempt();
  waiting.add(attempt);
  const stopLoaded = control.onLoaded(attempt);
  return () => {
    waiting.delete(attempt);
    stopLoaded();
    for (const unlink of unlinks.values()) {
      unlink();
    }
  };
}

/**
 * What the CSS runtime links scroll-driven animations with in a window:
 * Composition expressions over the scroll viewer's manipulation property set.
 * An animation whose scroll viewer is not in the tree yet, or whose named
 * timeline is not defined yet, links when it is.
 */
export const nativeScrollHost = {
  define({ control, definition }) {
    const element = elementOf(control);
    lastDefinitionId += 1;
    const id = lastDefinitionId;
    definitions.set(id, definition);
    const { properties } = ElementCompositionPreview.getElementVisual(element);
    const key = `${DEFINITION_PREFIX}${definition.name}`;
    properties.insertScalar(key, id);
    for (const retry of waiting) {
      retry();
    }

    return () => {
      properties.insertScalar(key, NOT_DEFINED);
      definitions.delete(id);
    };
  },
  link({ control, animations }) {
    return linkAnimations({
      control: elementOf(control),
      animations
    });
  }
} satisfies ScrollHost;
