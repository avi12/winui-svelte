import type { Vector2 } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";
import type { CompositionBrush } from "#winui/microsoft/ui/composition/CompositionBrush";
import { CompositionEffectSourceParameter } from "#winui/microsoft/ui/composition/CompositionEffectSourceParameter";
import type { Compositor } from "#winui/microsoft/ui/composition/Compositor";
import { ElementCompositionPreview } from "#winui/microsoft/ui/xaml/hosting/ElementCompositionPreview";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";
import type { IGraphicsEffect } from "#winui/windows/graphics/effects/IGraphicsEffect";

// The bridge from Win2D effect graphs to the Composition layer, where any
// element can be drawn through them: a Win2D effect (GaussianBlurEffect,
// ColorMatrixEffect, BlendEffect, ShadowEffect...) is a graphics effect
// Compositor.createEffectFactory accepts, with CompositionEffectSourceParameter
// standing where the pixels of the element go in.

/** The source of an effect that samples what is behind the element. */
export const BACKDROP = "backdrop";

/** The name the element's own pixels are given in an effect graph. */
export const ELEMENT_SOURCE = "source";

/** The graph input to give an effect as its `source` (or one of its sources). */
export function effectSource(name: string = ELEMENT_SOURCE) {
  return new CompositionEffectSourceParameter(name);
}

/**
 * A Composition brush that draws through an effect graph. `sources` gives the
 * brush behind each CompositionEffectSourceParameter name the graph uses.
 *
 * @throws {Error} when the compositor cannot build the graph
 */
export function createEffectBrush({ compositor, effect, sources }: {
  compositor: Compositor;
  effect: IGraphicsEffect;
  sources: Record<string, CompositionBrush>;
}) {
  const factory = compositor.createEffectFactory(effect);
  const brush = factory.createBrush();
  for (const [name, source] of Object.entries(sources)) {
    brush.setSourceParameter(name, source);
  }

  return brush;
}

/**
 * Draws an element's area through a Win2D effect: a sprite visual with the
 * effect's brush becomes the element's child visual. `source` says whose
 * pixels go through the effect: what is behind the element (`"backdrop"`, the
 * CSS `backdrop-filter` and `mix-blend-mode` case) or another element's own
 * (the CSS `filter` case). It sizes the sprite to the element's size now; call
 * it again after a resize.
 *
 * An element cannot be its own source here: its child visual would then be
 * part of what it samples. `elementVisualOf` (and the CSS properties built on
 * it) draws an element through an effect by hosting the sprite in its
 * parent's child visual slot; here, put the content in one element, the
 * effect over it in a sibling, and name the first as the source.
 *
 * @returns a function that removes the effect
 */
export function applyEffect({ element, effect, source = BACKDROP }: {
  element: UIElement;
  effect: IGraphicsEffect;
  source?: typeof BACKDROP | UIElement;
}) {
  const visual = ElementCompositionPreview.getElementVisual(element);
  const { compositor } = visual;
  const sprite = compositor.createSpriteVisual();
  sprite.size = element.actualSize;
  sprite.brush = createEffectBrush({
    compositor,
    effect,
    sources: {
      [ELEMENT_SOURCE]: sourceBrush({
        compositor,
        source,
        size: sprite.size
      })
    }
  });
  ElementCompositionPreview.setElementChildVisual(element, sprite);
  return () => {
    ElementCompositionPreview.setElementChildVisual(element, compositor.createContainerVisual());
    sprite.close();
  };
}

function sourceBrush({ compositor, source, size }: {
  compositor: Compositor;
  source: typeof BACKDROP | UIElement;
  size: Vector2;
}) {
  const isBackdrop = source === BACKDROP;
  if (isBackdrop) {
    return compositor.createBackdropBrush();
  }

  const surface = compositor.createVisualSurface();
  surface.sourceVisual = ElementCompositionPreview.getElementVisual(source);
  surface.sourceSize = size;
  return compositor.createSurfaceBrush(surface);
}
