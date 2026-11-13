import { colorOfArgb } from "./argb.ts";
import type { FilterStep } from "#src/css/parse/filters.js";
import { BLEND_MODES } from "#src/css/parse/visual-effects.js";
import type { VisualEffects } from "#src/css/parse/visual-effects.js";
import { CanvasAlphaMode } from "#winui/microsoft/graphics/canvas/CanvasAlphaMode";
import type { Color } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";
import { AlphaMaskEffect } from "#winui/microsoft/graphics/canvas/effects/AlphaMaskEffect";
import { BlendEffect } from "#winui/microsoft/graphics/canvas/effects/BlendEffect";
import { BlendEffectMode } from "#winui/microsoft/graphics/canvas/effects/BlendEffectMode";
import { ColorMatrixEffect } from "#winui/microsoft/graphics/canvas/effects/ColorMatrixEffect";
import { CompositeEffect } from "#winui/microsoft/graphics/canvas/effects/CompositeEffect";
import { GaussianBlurEffect } from "#winui/microsoft/graphics/canvas/effects/GaussianBlurEffect";
import type { IGraphicsEffectSource } from "#winui/windows/graphics/effects/IGraphicsEffectSource";

// The effect graph a CSS `filter`, `backdrop-filter`, `mix-blend-mode` and
// `mask-image` make together, in Win2D's effects. The graph says what to do to
// its inputs and not where they come from: a window gives it Composition's
// effect source parameters, a test gives it bitmaps and draws the result.

/** The name of the blur that a transition animates: the property is `BLUR_PROPERTY`. */
const BLUR_NAME = "Blur";

/** The property path of the animatable blur of an effect brush. */
export const BLUR_PROPERTY = `${BLUR_NAME}.BlurAmount`;

/** The name of the source of the pixels a `drop-shadow()` casts from, the `index`th of the filter. */
export function shadowName(index: number) {
  return `shadow${index}`;
}

/** Where the effect graph takes its pixels from. */
export interface GraphSources {
  /** The element's own pixels. */
  source: IGraphicsEffectSource;

  /** What is behind the element: for `backdrop-filter` and `mix-blend-mode`. */
  backdrop: IGraphicsEffectSource;

  /** The pixels whose alpha is the mask: for `mask-image`. */
  mask: IGraphicsEffectSource;

  /**
   * The element's own pixels moved by `x` and `y`, for a `drop-shadow()`: Composition has no way to
   * move the output of an effect, so a window gives each shadow a source of its own, offset.
   */
  shifted(input: {
    name: string;
    x: number;
    y: number;
  }): IGraphicsEffectSource;
}

const MATRIX_COLUMNS = 5;
const SHADOW_DEVIATION_PER_RADIUS = 2;
const BYTE_MAX = 255;

const BLEND_ENUM = new Map<string, BlendEffectMode>([
  ["multiply", BlendEffectMode.Multiply],
  ["screen", BlendEffectMode.Screen],
  ["overlay", BlendEffectMode.Overlay],
  ["darken", BlendEffectMode.Darken],
  ["lighten", BlendEffectMode.Lighten],
  ["color-dodge", BlendEffectMode.ColorDodge],
  ["color-burn", BlendEffectMode.ColorBurn],
  ["hard-light", BlendEffectMode.HardLight],
  ["soft-light", BlendEffectMode.SoftLight],
  ["difference", BlendEffectMode.Difference],
  ["exclusion", BlendEffectMode.Exclusion],
  ["hue", BlendEffectMode.Hue],
  ["saturation", BlendEffectMode.Saturation],
  ["color", BlendEffectMode.Color],
  ["luminosity", BlendEffectMode.Luminosity]
]);

/** The blend modes the graph can draw: `mix-blend-mode`'s keywords other than normal. */
export function drawableBlendModes() {
  return [...BLEND_ENUM.keys()].filter(mode => BLEND_MODES.has(mode));
}

const CHANNEL = {
  ALPHA: 3,
  OFFSET: 4
} as const;

// The entry of the CSS matrix (its rows are the output channels, its columns the inputs).
function cell({ values, input, output }: {
  values: readonly number[];
  input: number;
  output: number;
}) {
  return values[output * MATRIX_COLUMNS + input] ?? 0;
}

// The CSS matrix as Win2D's, whose rows are the inputs (and the fifth the offsets).
function win2dMatrix(values: readonly number[]) {
  return {
    m11: cell({
      values,
      input: 0,
      output: 0
    }),
    m12: cell({
      values,
      input: 0,
      output: 1
    }),
    m13: cell({
      values,
      input: 0,
      output: 2
    }),
    m14: cell({
      values,
      input: 0,
      output: CHANNEL.ALPHA
    }),
    m21: cell({
      values,
      input: 1,
      output: 0
    }),
    m22: cell({
      values,
      input: 1,
      output: 1
    }),
    m23: cell({
      values,
      input: 1,
      output: 2
    }),
    m24: cell({
      values,
      input: 1,
      output: CHANNEL.ALPHA
    }),
    m31: cell({
      values,
      input: 2,
      output: 0
    }),
    m32: cell({
      values,
      input: 2,
      output: 1
    }),
    m33: cell({
      values,
      input: 2,
      output: 2
    }),
    m34: cell({
      values,
      input: 2,
      output: CHANNEL.ALPHA
    }),
    m41: cell({
      values,
      input: CHANNEL.ALPHA,
      output: 0
    }),
    m42: cell({
      values,
      input: CHANNEL.ALPHA,
      output: 1
    }),
    m43: cell({
      values,
      input: CHANNEL.ALPHA,
      output: 2
    }),
    m44: cell({
      values,
      input: CHANNEL.ALPHA,
      output: CHANNEL.ALPHA
    }),
    m51: cell({
      values,
      input: CHANNEL.OFFSET,
      output: 0
    }),
    m52: cell({
      values,
      input: CHANNEL.OFFSET,
      output: 1
    }),
    m53: cell({
      values,
      input: CHANNEL.OFFSET,
      output: 2
    }),
    m54: cell({
      values,
      input: CHANNEL.OFFSET,
      output: CHANNEL.ALPHA
    })
  };
}

// The pixel as a flat colour with the pixel's alpha (Composition has no ShadowEffect, so a shadow is made of this).
function unit(channel: number) {
  return channel / BYTE_MAX;
}

function shadowMatrix(color: Color) {
  return win2dMatrix([
    0, 0, 0, 0, unit(color.r),
    0, 0, 0, 0, unit(color.g),
    0, 0, 0, 0, unit(color.b),
    0, 0, 0, unit(color.a), 0
  ]);
}

function composite(sources: readonly IGraphicsEffectSource[]) {
  const effect = new CompositeEffect();
  const list = effect.sources;
  const isMissing = list === null;
  if (isMissing) {
    throw new Error("a CompositeEffect has no list of sources");
  }

  for (const source of sources) {
    list.append(source);
  }

  return effect;
}

function stepEffect({ step, input, isNamed, shifted }: {
  step: FilterStep;
  input: IGraphicsEffectSource;
  isNamed: boolean;
  shifted: () => IGraphicsEffectSource;
}) {
  const isBlur = step.kind === "blur";
  if (isBlur) {
    const blur = new GaussianBlurEffect();
    blur.source = input;
    blur.blurAmount = step.radius;

    if (isNamed) {
      blur.name = BLUR_NAME;
    }

    return blur;
  }

  const isMatrix = step.kind === "matrix";
  if (isMatrix) {
    const matrix = new ColorMatrixEffect();
    matrix.source = input;
    matrix.alphaMode = CanvasAlphaMode.Straight;
    matrix.colorMatrix = win2dMatrix(step.values);
    return matrix;
  }

  const flat = new ColorMatrixEffect();
  flat.source = shifted();
  flat.alphaMode = CanvasAlphaMode.Straight;
  flat.colorMatrix = shadowMatrix(colorOfArgb(step.color));
  const shadow = new GaussianBlurEffect();
  shadow.source = flat;
  shadow.blurAmount = step.radius / SHADOW_DEVIATION_PER_RADIUS;
  return composite([shadow, input]);
}

function chain({ steps, input, hasNamedBlur, shift }: {
  steps: readonly FilterStep[];
  input: IGraphicsEffectSource;
  hasNamedBlur: boolean;
  shift: GraphSources["shifted"];
}) {
  let current = input;
  let isNameFree = hasNamedBlur;
  let iShadow = 0;
  for (const step of steps) {
    const isNamed = isNameFree && step.kind === "blur";
    isNameFree = isNameFree && !isNamed;
    const shadow = step.kind === "shadow" ? step : null;
    current = stepEffect({
      step,
      input: current,
      isNamed,
      shifted: () => shift({
        name: shadowName(iShadow++),
        x: shadow?.x ?? 0,
        y: shadow?.y ?? 0
      })
    });
  }

  return current;
}

type CanvasEffect = GaussianBlurEffect | ColorMatrixEffect | CompositeEffect | AlphaMaskEffect | BlendEffect;

// Whether the graph's root is one of the effects (and not the bare source, when the effects change nothing).
function isCanvasEffect(value: IGraphicsEffectSource): value is CanvasEffect {
  const classes = [GaussianBlurEffect, ColorMatrixEffect, CompositeEffect, AlphaMaskEffect, BlendEffect];
  return classes.some(effectClass => value instanceof effectClass);
}

/**
 * The graph of the effects of one element: its pixels through the `filter`,
 * then the `mask` (the alpha of the mask source), then over the backdrop
 * through the `backdrop-filter`, or blended with it by the blend mode. The
 * first blur of the `filter` is named `BLUR_NAME`, so a brush made from the
 * graph can animate it (`BLUR_PROPERTY`).
 */
export function buildEffectGraph({ effects, sources }: {
  effects: VisualEffects;
  sources: GraphSources;
}) {
  let image: IGraphicsEffectSource = chain({
    steps: effects.filter,
    input: sources.source,
    hasNamedBlur: true,
    shift: sources.shifted
  });
  const hasMask = effects.mask !== null;
  if (hasMask) {
    const masked = new AlphaMaskEffect();
    masked.source = image;
    masked.alphaMask = sources.mask;
    image = masked;
  }

  const hasBackdropFilter = effects.backdrop.length > 0;
  const blend = effects.blend === null ? undefined : BLEND_ENUM.get(effects.blend);
  const background = hasBackdropFilter ? chain({
    steps: effects.backdrop,
    input: sources.backdrop,
    hasNamedBlur: false,
    shift: sources.shifted
  }) : sources.backdrop;
  const isBlended = blend !== undefined;
  if (isBlended) {
    const blended = new BlendEffect();
    blended.background = background;
    blended.foreground = image;
    blended.mode = blend;
    return blended satisfies CanvasEffect;
  }

  const root = hasBackdropFilter ? composite([background, image]) : image;
  if (!isCanvasEffect(root)) {
    throw new Error("the effects change nothing, so there is no graph to build");
  }

  return root;
}
