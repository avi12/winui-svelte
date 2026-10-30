import { createGeometricClip } from "./clip-geometry.ts";
import { effectSource } from "./composition.ts";
import { BLUR_PROPERTY, buildEffectGraph, shadowName } from "./effect-graph.ts";
import { parentElementOf } from "./element-guard.ts";
import { createMaskBrush } from "./mask-brush.ts";
import { resolveClipShape } from "#src/css/parse/clip-shapes.js";
import type { ClipShape } from "#src/css/parse/clip-shapes.js";
import { isNoEffect, NO_EFFECTS } from "#src/css/parse/visual-effects.js";
import type { VisualEffects } from "#src/css/parse/visual-effects.js";
import type { CompositionEffectBrush } from "#winui/microsoft/ui/composition/CompositionEffectBrush";
import type { CompositionVisualSurface } from "#winui/microsoft/ui/composition/CompositionVisualSurface";
import type { CompositionContainerVisual } from "#winui/microsoft/ui/composition/ContainerVisual";
import type { SpriteVisual } from "#winui/microsoft/ui/composition/SpriteVisual";
import type { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";
import { ElementCompositionPreview } from "#winui/microsoft/ui/xaml/hosting/ElementCompositionPreview";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";
import { Visibility } from "#winui/microsoft/ui/xaml/Visibility";

// What CSS does to the drawing of one element, on its Composition visual: the
// effect graph of `filter`, `backdrop-filter`, `mix-blend-mode` and `mask-image`,
// and the clip of `clip-path`.
//
// An effect draws the element's own pixels, so the element must not draw them
// too: a sprite visual samples the element's visual through a visual surface
// (which renders it whatever its IsVisible), and the element's visual is hidden.
// The sprite sits in the child-visual slot of the element's parent, since the
// slot of the element itself is part of the visual the surface samples. A
// parent's slot is drawn over all of its children, so an element with an effect
// draws over the later siblings it overlaps; an element with no parent in the
// tree (a window's content) keeps its own pixels under its effect.

/** What one element's visual is made to do: the effects and the clip CSS gave it, and a blur a transition animates. */
export interface ElementVisual {
  /** The effects of `filter`, `backdrop-filter`, `mix-blend-mode` and `mask-image`; `NO_EFFECTS` takes them off. */
  setEffects(effects: VisualEffects): void;

  /** The shape of `clip-path`; null takes it off. */
  setClip(shape: ClipShape | null): void;

  /** The standard deviation of a blur that is added to the element's, or replaces its first, now; null takes it off. */
  setBlur(radius: number | null): void;
}

interface Slot {
  container: CompositionContainerVisual;
}

// A sprite that is drawing the element through its effects.
interface Shown {
  sprite: SpriteVisual;
  brush: CompositionEffectBrush;
  surface: CompositionVisualSurface;
  owner: UIElement;
  isHosted: boolean;
  isClipped: boolean;
  margin: number;
  signature: string;
  size: {
    width: number;
    height: number;
  };
  stop(): void;
}

const slots = new Map<string, Slot>();
const controllers = new WeakMap<UIElement, Controller>();
const SLOT_COMMENT = "winui-svelte effects ";
const BLEED_SIGMAS = 3;
const SHADOW_SIGMA_PER_RADIUS = 2;
const NO_BLUR_RADIUS = 0;
const UNCLIPPED_INSET = 1_000_000;
const NEWLINE = "\n";
const TRANSPARENT = {
  a: 0,
  r: 0,
  g: 0,
  b: 0
};

function compositorOf(element: UIElement) {
  return ElementCompositionPreview.getElementVisual(element).compositor;
}

// The child-visual slot of `owner`, shared by every sprite that wants it; null when someone else's visual holds it.
// A new object stands for the same parent each time, so a slot is told by the comment its owner's visual carries.
function slotOf(owner: UIElement) {
  const ownerVisual = ElementCompositionPreview.getElementVisual(owner);
  const known = slots.get(ownerVisual.comment);
  const hasKnown = known !== undefined;
  if (hasKnown) {
    return known;
  }

  const foreign: unknown = ElementCompositionPreview.getElementChildVisual(owner);
  const isForeign = foreign !== null && foreign !== undefined;
  if (isForeign) {
    return null;
  }

  const container = ownerVisual.compositor.createContainerVisual();
  ElementCompositionPreview.setElementChildVisual(owner, container);
  const comment = `${SLOT_COMMENT}${slots.size}`;
  ownerVisual.comment = comment;
  const slot = { container };
  slots.set(comment, slot);
  return slot;
}

// How far one step of the filter draws outside the element: three deviations of a blur, and a shadow's offset and blur
// (a backdrop filter stays inside the element).
function reachOf(step: VisualEffects["filter"][number]) {
  const isBlur = step.kind === "blur";
  if (isBlur) {
    return step.radius * BLEED_SIGMAS;
  }

  const isShadow = step.kind === "shadow";
  const shadowBlur = step.kind === "shadow" ? step.radius / SHADOW_SIGMA_PER_RADIUS * BLEED_SIGMAS : 0;
  return isShadow ? Math.max(Math.abs(step.x), Math.abs(step.y)) + shadowBlur : 0;
}

function marginOf(effects: VisualEffects) {
  const reaches = effects.filter.map(step => reachOf(step));
  return Math.ceil(Math.max(0, ...reaches));
}

function firstBlurRadius(effects: VisualEffects) {
  const blur = effects.filter.find(step => step.kind === "blur");
  return blur?.kind === "blur" ? blur.radius : null;
}

// The effects as the element is drawn with them: a transition's blur is the first of the filter.
function withBlur({ effects, radius }: {
  effects: VisualEffects;
  radius: number | null;
}) {
  const isAdded = radius !== null && firstBlurRadius(effects) === null;
  return isAdded ? {
    ...effects,
    filter: [{
      kind: "blur",
      radius
    }, ...effects.filter]
  } satisfies VisualEffects : effects;
}

// The effects with the radius of the animated blur left out: what decides whether the graph must be built again.
function signatureOf(effects: VisualEffects) {
  return JSON.stringify({
    ...effects,
    filter: effects.filter.map(step => step.kind === "blur" ? {
      ...step,
      radius: NO_BLUR_RADIUS
    } : step)
  });
}

class Controller implements ElementVisual {
  private readonly element: FrameworkElement;
  private effects: VisualEffects = NO_EFFECTS;
  private clip: ClipShape | null = null;
  private blur: number | null = null;
  private shown: Shown | null = null;
  private stopWatching: (() => void) | null = null;
  private isElementClipSet = false;

  constructor(element: FrameworkElement) {
    this.element = element;
  }

  setEffects(effects: VisualEffects) {
    this.effects = effects;
    this.refresh();
  }

  setClip(shape: ClipShape | null) {
    this.clip = shape;
    this.refresh();
  }

  setBlur(radius: number | null) {
    this.blur = radius;
    this.refresh();
  }

  private get wanted() {
    return withBlur({
      effects: this.effects,
      radius: this.blur
    });
  }

  // Brings the drawing in line with what is wanted: nothing, a clip, or a sprite.
  private refresh() {
    const isIdle = isNoEffect(this.wanted) && this.clip === null;
    if (isIdle) {
      this.stopWatching?.();
      this.stopWatching = null;
      this.hide();
      this.placeClip({
        width: 0,
        height: 0
      });
      controllers.delete(this.element);
      return;
    }

    this.watch();
    this.layout();
  }

  private watch() {
    const isWatching = this.stopWatching !== null;
    if (isWatching) {
      return;
    }

    const stops = [
      this.element.onLayoutUpdated(() => this.layout()),
      this.element.onUnloaded(() => this.hide()),
      this.element.onLoaded(() => this.layout())
    ];
    this.stopWatching = () => {
      for (const stop of stops) {
        stop();
      }
    };
  }

  // A failure here is raised from a WinUI event, which would only say that a callback failed.
  private layout() {
    try {
      this.arrange();
    } catch (error) {
      process.stderr.write(`winui-svelte css: ${error instanceof Error ? error.message : String(error)}${NEWLINE}`);
    }
  }

  private arrange() {
    const { element } = this;
    const { x: width, y: height } = element.actualSize;
    const isMeasured = width > 0 && height > 0;
    if (!isMeasured) {
      return;
    }

    const { wanted } = this;
    const isEffect = !isNoEffect(wanted);
    if (isEffect) {
      this.showEffects({
        wanted,
        width,
        height
      });
    } else {
      this.hide();
    }

    this.placeClip({
      width,
      height
    });
  }

  private showEffects({ wanted, width, height }: {
    wanted: VisualEffects;
    width: number;
    height: number;
  }) {
    const signature = signatureOf(wanted);
    const isStale = this.shown !== null && this.shown.signature !== signature;
    if (isStale) {
      this.hide();
    }

    const { shown } = this;
    const isShownMissing = shown === null;
    if (isShownMissing) {
      this.build({
        wanted,
        signature
      });
      return;
    }

    this.place({
      shown,
      wanted,
      width,
      height
    });
    const radius = this.blur ?? firstBlurRadius(this.effects);
    const hasRadius = radius !== null;
    if (hasRadius) {
      shown.brush.properties.insertScalar(BLUR_PROPERTY, radius);
    }
  }

  private build({ wanted, signature }: {
    // dbg
    wanted: VisualEffects;
    signature: string;
  }) {
    const { element } = this;
    const compositor = compositorOf(element);
    const parent = parentElementOf(element);
    const isHosted = parent !== null;
    const owner = parent ?? element;
    const slot = slotOf(owner);
    const isSlotMissing = slot === null;
    if (isSlotMissing) {
      throw new Error("the element or its parent already holds a Composition child visual of its own");
    }

    const visual = ElementCompositionPreview.getElementVisual(element);
    const surface = compositor.createVisualSurface();
    surface.sourceVisual = visual;
    const hasBlur = firstBlurRadius(wanted) !== null;
    const factory = compositor.createEffectFactory(
      buildEffectGraph({
        effects: wanted,
        sources: {
          source: effectSource("source"),
          backdrop: effectSource("backdrop"),
          mask: effectSource("mask"),
          shifted: ({ name }) => effectSource(name)
        }
      }), hasBlur ? [BLUR_PROPERTY] : null
    );
    const brush = factory.createBrush();
    const margin = marginOf(wanted);
    const sourceBrush = compositor.createSurfaceBrush(surface);
    brush.setSourceParameter("source", sourceBrush);
    let iShadow = 0;
    for (const step of wanted.filter) {
      const isShadow = step.kind === "shadow";
      if (isShadow) {
        const shifted = compositor.createSurfaceBrush(surface);
        shifted.offset = {
          x: step.x,
          y: step.y
        };
        brush.setSourceParameter(shadowName(iShadow++), shifted);
      }
    }

    const hasBackdrop = wanted.backdrop.length > 0 || wanted.blend !== null;
    if (hasBackdrop) {
      brush.setSourceParameter("backdrop", compositor.createBackdropBrush());
    }

    const hasMask = wanted.mask !== null;
    if (hasMask) {
      brush.setSourceParameter("mask", compositor.createColorBrush(TRANSPARENT));
    }

    const sprite = compositor.createSpriteVisual();
    sprite.brush = brush;
    slot.container.children.insertAtTop(sprite);
    const shown: Shown = {
      sprite,
      brush,
      surface,
      owner,
      isHosted,
      isClipped: false,
      margin,
      signature,
      size: {
        width: 0,
        height: 0
      },
      stop() {
        slot.container.children.remove(sprite);
        sprite.close();
        surface.close();
      }
    };
    this.shown = shown;
    this.layout();
  }

  private async placeMask({ shown, wanted }: {
    shown: Shown;
    wanted: VisualEffects;
  }) {
    const { mask } = wanted;
    const isMaskMissing = mask === null;
    if (isMaskMissing) {
      return;
    }

    const { width, height } = shown.size;
    const brush = await createMaskBrush({
      compositor: compositorOf(this.element),
      mask,
      area: {
        width,
        height,
        margin: shown.margin
      }
    });
    const isCurrent = this.shown === shown;
    if (isCurrent) {
      shown.brush.setSourceParameter("mask", brush);
    }
  }

  private place({ shown, wanted, width, height }: {
    shown: Shown;
    wanted: VisualEffects;
    width: number;
    height: number;
  }) {
    const { element } = this;
    const { margin, sprite } = shown;
    const origin = shown.isHosted ? element.transformToVisual(shown.owner).transformPoint({
      x: 0,
      y: 0
    }) : {
      x: 0,
      y: 0
    };
    const visual = ElementCompositionPreview.getElementVisual(element);
    sprite.size = {
      x: width + 2 * margin,
      y: height + 2 * margin
    };
    sprite.offset = {
      x: origin.x - margin,
      y: origin.y - margin,
      z: 0
    };
    sprite.isVisible = element.visibility === Visibility.Visible;
    sprite.opacity = element.opacity;
    const isChanged = shown.size.width !== width || shown.size.height !== height;
    if (isChanged) {
      shown.size = {
        width,
        height
      };
      this.sizeSurface({
        shown,
        width,
        height
      });
      this.placeMask({
        shown,
        wanted
      });
    }

    if (shown.isHosted) {
      visual.isVisible = false;
    }
  }

  // The surface the sprite samples covers the element; the brush that paints it leaves the margin around it clear.
  private sizeSurface({ shown, width, height }: {
    shown: Shown;
    width: number;
    height: number;
  }) {
    const { surface } = shown;
    surface.sourceOffset = {
      x: -shown.margin,
      y: -shown.margin
    };
    surface.sourceSize = {
      x: width + 2 * shown.margin,
      y: height + 2 * shown.margin
    };
  }

  // The clip goes on the element's visual, or on the sprite that draws it when it has effects.
  private placeClip({ width, height }: {
    width: number;
    height: number;
  }) {
    const { element, shown } = this;
    const compositor = compositorOf(element);
    const visual = ElementCompositionPreview.getElementVisual(element);
    const shape = this.clip === null ? null : resolveClipShape({
      shape: this.clip,
      width,
      height
    });
    const clipFor = (offset: number) => shape === null ? compositor.createInsetClip(
      -UNCLIPPED_INSET, -UNCLIPPED_INSET, -UNCLIPPED_INSET, -UNCLIPPED_INSET
    ) : createGeometricClip({
      compositor,
      shape,
      offset: {
        x: offset,
        y: offset
      }
    });
    const isElementClipped = shape !== null && shown === null;
    const shouldSetElementClip = isElementClipped || this.isElementClipSet;
    if (shouldSetElementClip) {
      visual.clip = clipFor(0);
      this.isElementClipSet = isElementClipped;
    }

    const isSpriteClipped = shown !== null && (shape !== null || shown.isClipped);
    if (isSpriteClipped) {
      shown.sprite.clip = clipFor(shown.margin);
      shown.isClipped = shape !== null;
    }
  }

  private hide() {
    const { shown, element } = this;
    shown?.stop();
    this.shown = null;
    const visual = ElementCompositionPreview.getElementVisual(element);
    visual.isVisible = element.visibility === Visibility.Visible;
  }
}

/**
 * The handle on what CSS does to one element's visual: made when asked for,
 * shared by `filter`, `clip-path` and a transition's blur, and let go of when
 * none of them wants anything of the element.
 */
export function elementVisualOf(element: FrameworkElement) {
  const known = controllers.get(element);
  const hasKnown = known !== undefined;
  if (hasKnown) {
    return known;
  }

  const controller = new Controller(element);
  controllers.set(element, controller);
  return controller;
}
