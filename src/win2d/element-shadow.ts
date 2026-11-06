import { colorOfArgb } from "./argb.ts";
import { childSlotOf } from "./child-slot.ts";
import { createGeometricClip } from "./clip-geometry.ts";
import { controllerOf, ElementFollower } from "./element-lifecycle.ts";
import type { ElementSize } from "./element-lifecycle.ts";
import { shadowFrame } from "./shadow-geometry.ts";
import type { ShadowLayer } from "#src/css/parse/box-shadow.js";
import type { CompositionDropShadow } from "#winui/microsoft/ui/composition/DropShadow";
import type { SpriteVisual } from "#winui/microsoft/ui/composition/SpriteVisual";
import type { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";
import { ElementCompositionPreview } from "#winui/microsoft/ui/xaml/hosting/ElementCompositionPreview";

// A `box-shadow` drawn by Composition: one sprite visual per layer in the
// element's own child-visual slot, each with a DropShadow. The sprite has no
// brush of its own; the shadow's mask is a solid brush, so the shadow is the
// rectangle of the sprite, and the sprite's clip cuts the element's border box
// out of it (src/win2d/shadow-geometry.ts has the numbers).

const OPAQUE_WHITE = {
  a: 255,
  r: 255,
  g: 255,
  b: 255
};

/** What one element's Composition shadow is made to do. */
interface ElementShadow {
  /** Draws these layers (the first on top), or none for an empty list. */
  setLayers(layers: readonly ShadowLayer[]): void;
}

// A sprite that casts one layer, and what takes it off again.
interface Cast {
  sprite: SpriteVisual;
  shadow: CompositionDropShadow;
  stop(): void;
}

const controllers = new WeakMap<FrameworkElement, Controller>();

class Controller implements ElementShadow {
  private readonly element: FrameworkElement;
  private layers: readonly ShadowLayer[] = [];
  private casts: Cast[] = [];
  private readonly follower: ElementFollower;

  constructor(element: FrameworkElement) {
    this.element = element;
    this.follower = new ElementFollower({
      element,
      arrange: size => this.arrange(size),
      onUnload: () => this.clear()
    });
  }

  setLayers(layers: readonly ShadowLayer[]) {
    this.layers = layers;
    this.clear();
    const isIdle = layers.length === 0;
    if (isIdle) {
      this.follower.stop();
      controllers.delete(this.element);
      return;
    }

    this.follower.start();
  }

  private arrange({ width, height }: ElementSize) {
    const isBuilt = this.casts.length === this.layers.length;
    if (!isBuilt) {
      this.clear();
      this.build();
    }

    for (const [iLayer, layer] of this.layers.entries()) {
      const cast = this.casts[iLayer];
      const hasCast = cast !== undefined;
      if (hasCast) {
        this.place({
          cast,
          layer,
          size: {
            width,
            height
          }
        });
      }
    }
  }

  private build() {
    const slot = childSlotOf(this.element);
    const isSlotMissing = slot === null;
    if (isSlotMissing) {
      throw new Error("the element already holds a Composition child visual of its own");
    }

    const { compositor } = ElementCompositionPreview.getElementVisual(this.element);
    for (const layer of this.layers) {
      const sprite = compositor.createSpriteVisual();
      const shadow = compositor.createDropShadow();
      shadow.mask = compositor.createColorBrush(OPAQUE_WHITE);
      shadow.color = colorOfArgb(layer.color);
      sprite.shadow = shadow;
      slot.container.children.insertAtBottom(sprite);
      this.casts.push({
        sprite,
        shadow,
        stop() {
          slot.container.children.remove(sprite);
          sprite.close();
          shadow.close();
        }
      });
    }
  }

  private place({ cast, layer, size }: {
    cast: Cast;
    layer: ShadowLayer;
    size: {
      width: number;
      height: number;
    };
  }) {
    const { sprite, shadow } = cast;
    const frame = shadowFrame({
      layer,
      size
    });
    const { compositor } = ElementCompositionPreview.getElementVisual(this.element);
    sprite.isVisible = frame.isVisible;
    sprite.size = frame.size;
    sprite.offset = frame.offset;
    sprite.clip = createGeometricClip({
      compositor,
      shape: frame.clip,
      offset: {
        x: 0,
        y: 0
      }
    });
    shadow.blurRadius = frame.blurRadius;
    shadow.offset = frame.shadowOffset;
  }

  private clear() {
    for (const cast of this.casts) {
      cast.stop();
    }

    this.casts = [];
  }
}

/**
 * The handle on the Composition shadow of one element: made when asked for,
 * and let go of when its layers are emptied.
 */
export function elementShadowOf(element: FrameworkElement) {
  return controllerOf({
    controllers,
    element,
    create: () => new Controller(element)
  });
}
