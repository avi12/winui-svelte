import { parseGradient } from "./gradients.ts";
import { splitWords } from "./split.ts";
import { z } from "zod";

// What `filter`, `backdrop-filter`, `mix-blend-mode`, `mask` and `mask-image`
// of one element say together: the one effect graph its visual is drawn
// through. The build lowers the declarations to this, the window reads it back.

const FILTER_STEP = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("blur"),
    radius: z.number()
  }),
  z.object({
    kind: z.literal("matrix"),
    values: z.array(z.number())
  }),
  z.object({
    kind: z.literal("shadow"),
    x: z.number(),
    y: z.number(),
    radius: z.number(),
    color: z.string()
  })
]);

const POINT = z.object({
  x: z.number(),
  y: z.number()
});

const STOPS = z.array(
  z.object({
    color: z.string(),
    offset: z.number()
  })
);

const MASK_GRADIENT = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("linear"),
    start: POINT,
    end: POINT,
    stops: STOPS
  }),
  z.object({
    kind: z.literal("radial"),
    center: POINT,
    radiusX: z.number(),
    radiusY: z.number(),
    stops: STOPS
  })
]);

const MASK = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("gradient"),
    gradient: MASK_GRADIENT
  }),
  z.object({
    kind: z.literal("image"),
    url: z.string()
  })
]);

const VISUAL_EFFECTS = z.object({
  filter: z.array(FILTER_STEP),
  backdrop: z.array(FILTER_STEP),
  blend: z.string().nullable(),
  mask: MASK.nullable()
});

/** An element's filter, backdrop filter, blend mode and mask, in the terms of an effect graph. */
export type VisualEffects = z.infer<typeof VISUAL_EFFECTS>;

/** What an element's `mask-image` draws its opacity from. */
export type MaskSource = z.infer<typeof MASK>;

/** The `mix-blend-mode` keywords other than `normal`. */
export const BLEND_MODES: ReadonlySet<string> = new Set([
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity"
]);

const NORMAL = "normal";
const NONE = "none";
const URL_IMAGE = /^url\(\s*(["']?)(.*?)\1\s*\)$/isu;

/** The effects of an element that has none. */
export const NO_EFFECTS: VisualEffects = {
  filter: [],
  backdrop: [],
  blend: null,
  mask: null
};

/** Whether the effects change nothing. */
export function isNoEffect(effects: VisualEffects) {
  const isUnfiltered = effects.filter.length === 0 && effects.backdrop.length === 0;
  return isUnfiltered && effects.blend === null && effects.mask === null;
}

/** The effects a write of the CSS runtime carries, from its JSON. */
export function readVisualEffects(json: string) {
  return VISUAL_EFFECTS.parse(JSON.parse(json));
}

/** The JSON a write carries. */
export function writeVisualEffects(effects: VisualEffects) {
  return JSON.stringify(effects);
}

/**
 * A `mix-blend-mode` value: `normal` (null) or a keyword of `BLEND_MODES`
 * (kept as written, in lower case); `reason` for anything else.
 */
export function parseBlendMode(text: string) {
  const word = text.trim().toLowerCase();
  const isNormal = word === NORMAL;
  if (isNormal) {
    return {
      isValid: true,
      mode: null
    } as const;
  }

  const isKnown = BLEND_MODES.has(word);
  return isKnown ? {
    isValid: true,
    mode: word
  } as const : {
    isValid: false,
    reason: `${text} is not a blend mode (normal, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion, hue, saturation, color or luminosity)`
  } as const;
}

/**
 * A `mask-image` value: `none`, a `linear-gradient()` or `radial-gradient()`
 * (whose alpha is the mask) or a `url()` (the image's alpha); `reason` for
 * anything else. A `mask` shorthand's first image goes through the same.
 */
export function parseMaskImage(text: string) {
  const word = text.trim();
  const isNone = word.toLowerCase() === NONE;
  if (isNone) {
    return {
      isValid: true,
      mask: null,
      warnings: []
    } as const;
  }

  const url = URL_IMAGE.exec(word)?.[2];
  const isUrl = url !== undefined;
  if (isUrl) {
    return {
      isValid: true,
      mask: {
        kind: "image",
        url
      },
      warnings: []
    } as const;
  }

  const result = parseGradient(word);
  if (!result.isValid) {
    return {
      isValid: false,
      reason: result.reason
    } as const;
  }

  const { gradient } = result;
  const stops = gradient.stops.map(({ color, offset }) => ({
    color,
    offset
  }));
  const mask = gradient.kind === "linear" ? {
    kind: "linear",
    start: gradient.start,
    end: gradient.end,
    stops
  } as const : {
    kind: "radial",
    center: gradient.center,
    radiusX: gradient.radiusX,
    radiusY: gradient.radiusY,
    stops
  } as const;
  return {
    isValid: true,
    mask: {
      kind: "gradient",
      gradient: mask
    },
    warnings: gradient.warnings
  } as const;
}

/**
 * The image of a `mask` shorthand: the first word that is an image (a
 * gradient or a `url()`), or `none`; the position, size, repeat and the other
 * longhands are not read.
 */
export function maskShorthandImage(text: string) {
  const words = splitWords(text);
  const image = words.find(word => word.includes("("));
  return image ?? NONE;
}
