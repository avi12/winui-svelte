import { ScrollAxis } from "#src/css/parse/scroll-timeline.js";
import type { ViewInset } from "#src/css/parse/scroll-timeline.js";
import {
  ExpressionParameter,
  LinkedProperty,
  LinkProperty,
  progressExpression,
  rangeOffsets,
  RESTING_VALUES,
  trackExpression
} from "#src/css/translate/scroll-link.js";
import type { LinkedAnimation } from "#src/css/translate/scroll-link.js";
import type { Visual } from "#winui/microsoft/ui/composition/Visual";
import type { ScrollViewer } from "#winui/microsoft/ui/xaml/controls/ScrollViewer";
import type { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";
import { ElementCompositionPreview } from "#winui/microsoft/ui/xaml/hosting/ElementCompositionPreview";

// Links an element's Composition properties to a scroll viewer: the scroll
// viewer's manipulation property set feeds an ExpressionAnimation that gives a
// link its progress through the animation range, and one ExpressionAnimation
// per animated property turns that progress into the property's value. The
// compositor runs them, so the element follows the scroll with the UI thread
// idle.

/** An animation with the scroll viewer and the subject its timeline measures. */
export interface ResolvedLink {
  readonly animation: LinkedAnimation;
  readonly axis: ScrollAxis;
  readonly inset: ViewInset;
  /** The element whose passage through the viewport a view timeline measures; null for a scroll timeline. */
  readonly subject: FrameworkElement | null;
}

const ZERO = {
  x: 0,
  y: 0,
  z: 0
};
const ORIGIN = {
  x: 0,
  y: 0
};
const TRANSLATION = "Translation";
const HALF = 0.5;

function readUnderlying({ visual, property }: {
  visual: Visual;
  property: LinkedProperty;
}) {
  return property === LinkedProperty.OPACITY ? visual.opacity : RESTING_VALUES.get(property) ?? 0;
}

function restore({ visual, property, value }: {
  visual: Visual;
  property: LinkedProperty;
  value: number;
}) {
  const { scale, properties } = visual;
  const restorers = new Map<LinkedProperty, () => void>([
    [LinkedProperty.OPACITY, () => {
      visual.opacity = value;
    }],
    [LinkedProperty.ROTATION, () => {
      visual.rotationAngleInDegrees = value;
    }],
    [LinkedProperty.SCALE_X, () => {
      visual.scale = {
        ...scale,
        x: value
      };
    }],
    [LinkedProperty.SCALE_Y, () => {
      visual.scale = {
        ...scale,
        y: value
      };
    }],
    [LinkedProperty.TRANSLATION_X, () => properties.insertVector3(TRANSLATION, ZERO)],
    [LinkedProperty.TRANSLATION_Y, () => properties.insertVector3(TRANSLATION, ZERO)]
  ]);
  restorers.get(property)?.();
}

/**
 * How far the scroll viewer is scrolled along the axis, in pixels.
 *
 * @param input - The scroll viewer and the axis.
 * @returns The offset.
 */
export function scrollOffset({ scroller, axis }: {
  scroller: ScrollViewer;
  axis: ScrollAxis;
}) {
  return axis === ScrollAxis.HORIZONTAL ? scroller.horizontalOffset : scroller.verticalOffset;
}

/**
 * What a timeline measures now: the scroll range and the viewport along its
 * axis and, for a view timeline, where its subject sits in the scrolled content.
 *
 * @param input - The scroll viewer and the link's axis, subject and inset.
 * @returns The geometry `rangeOffsets` reads.
 */
export function scrollGeometry({ scroller, link }: {
  scroller: ScrollViewer;
  link: Pick<ResolvedLink, "axis" | "inset" | "subject">;
}) {
  const isHorizontal = link.axis === ScrollAxis.HORIZONTAL;
  const { subject } = link;
  const position = subject?.transformToVisual(scroller).transformPoint(ORIGIN) ?? ORIGIN;
  const offset = scrollOffset({
    scroller,
    axis: link.axis
  });
  return {
    scrollExtent: isHorizontal ? scroller.scrollableWidth : scroller.scrollableHeight,
    viewport: isHorizontal ? scroller.viewportWidth : scroller.viewportHeight,
    subject: subject === null ? null : {
      start: (isHorizontal ? position.x : position.y) + offset,
      size: isHorizontal ? subject.actualWidth : subject.actualHeight
    },
    inset: link.inset
  };
}

/**
 * Drives the element's opacity, translation, scale and rotation from the
 * scroll viewer's position, one link for each animation. The range of a link
 * is measured again whenever the layout changes. Scale and rotation turn
 * about the element's center.
 *
 * @param input - The element, the scroll viewer that moves it, and the animations with their timelines resolved.
 * @returns A function that unlinks them and puts back the values the element had
 */
export function linkScroll({ target, scroller, links }: {
  target: FrameworkElement;
  scroller: ScrollViewer;
  links: readonly ResolvedLink[];
}) {
  const visual = ElementCompositionPreview.getElementVisual(target);
  const { compositor } = visual;
  const scrollProperties = ElementCompositionPreview.getScrollViewerManipulationPropertySet(scroller);
  const properties = links.flatMap(link => link.animation.tracks.map(track => track.property));
  const underlying = new Map(properties.map(property => [property, readUnderlying({
    visual,
    property
  })]));
  const isTranslated = properties.some(property => property.startsWith(TRANSLATION));
  const isPivoted = properties.some(property => property.startsWith("Scale") || property === LinkedProperty.ROTATION);
  if (isTranslated) {
    ElementCompositionPreview.setIsTranslationEnabled(target, true);
    visual.properties.insertVector3(TRANSLATION, ZERO);
  }

  const linkSets = links.map(link => {
    const linkSet = compositor.createPropertySet();
    linkSet.insertScalar(LinkProperty.START, 0);
    linkSet.insertScalar(LinkProperty.END, 1);
    linkSet.insertScalar(LinkProperty.PROGRESS, 0);
    const progress = compositor.createExpressionAnimation(
      progressExpression({
        axis: link.axis,
        isReversed: link.animation.isReversed
      })
    );
    progress.setReferenceParameter(ExpressionParameter.SCROLLER, scrollProperties);
    progress.setReferenceParameter(ExpressionParameter.LINK, linkSet);
    linkSet.startAnimation(LinkProperty.PROGRESS, progress);
    for (const track of link.animation.tracks) {
      const animation = compositor.createExpressionAnimation(
        trackExpression({
          track,
          underlying: underlying.get(track.property) ?? 0
        })
      );
      animation.setReferenceParameter(ExpressionParameter.LINK, linkSet);
      visual.startAnimation(track.property, animation);
    }

    return linkSet;
  });

  function refresh() {
    for (const [i, link] of links.entries()) {
      const range = rangeOffsets({
        geometry: scrollGeometry({
          scroller,
          link
        }),
        start: link.animation.start,
        end: link.animation.end
      });
      linkSets[i]?.insertScalar(LinkProperty.START, range.start);
      linkSets[i]?.insertScalar(LinkProperty.END, range.end);
    }

    if (isPivoted) {
      visual.centerPoint = {
        x: target.actualWidth * HALF,
        y: target.actualHeight * HALF,
        z: 0
      };
    }
  }

  refresh();
  const unsubscribe = target.onLayoutUpdated(refresh);
  return () => {
    unsubscribe();
    for (const property of new Set(properties)) {
      visual.stopAnimation(property);
    }

    for (const [property, value] of underlying) {
      restore({
        visual,
        property,
        value
      });
    }

    for (const linkSet of linkSets) {
      linkSet.stopAnimation(LinkProperty.PROGRESS);
      linkSet.close();
    }
  };
}
