import { pixelsOf, splitTopLevel } from "./css-split.ts";

export interface ShadowDepth {
  depth: number;
  use: string;
}

export interface Material {
  name: string;
  light: string;
  dark: string;
  isTranslucent: boolean;
}

const ELEVATION = "-winui-elevation";
const BOX_SHADOW = "box-shadow";
const BACKDROP = "backdrop";
const BLUR_INDEX = 2;

/**
 * Whether the property sets a depth the shadow ladder draws.
 */
export function isShadowProperty(property: string) {
  return property === ELEVATION || property === BOX_SHADOW;
}

/**
 * The depth a ThemeShadow gets from the value: `-winui-elevation` is the depth in pixels, and the first shadow of
 * a `box-shadow` is its blur radius, or its larger offset when it has no blur
 * (src/css/translate/surface-properties.ts).
 * Undefined when the value is neither.
 */
export function shadowDepthOf({ property, value }: {
  property: string;
  value: string;
}) {
  const isElevation = property === ELEVATION;
  if (isElevation) {
    return pixelsOf(value);
  }

  const isBoxShadow = property === BOX_SHADOW;
  if (!isBoxShadow) {
    return undefined;
  }

  const first = splitTopLevel({
    text: value,
    separator: ","
  })[0] ?? "";
  const lengths = splitTopLevel({
    text: first,
    separator: " "
  }).map(pixelsOf).filter(length => length !== undefined);
  const [across, down] = lengths;
  const blur = lengths[BLUR_INDEX] ?? 0;
  const hasOffsets = across !== undefined && down !== undefined;
  if (!hasOffsets) {
    return undefined;
  }

  return blur > 0 ? blur : Math.max(Math.abs(across), Math.abs(down));
}

/**
 * The index of the step of the ladder a depth is closest to (the shallower one on a tie), or -1 for an empty ladder.
 */
export function nearestStep({ depth, steps }: {
  depth: number;
  steps: readonly ShadowDepth[];
}) {
  let nearest = -1;
  let distance = Number.POSITIVE_INFINITY;
  for (const [i, step] of steps.entries()) {
    const gap = Math.abs(step.depth - depth);
    const isCloser = gap < distance;
    if (isCloser) {
      nearest = i;
      distance = gap;
    }
  }

  return nearest;
}

/**
 * The material a `backdrop` value names (`mica`, `acrylic`), or undefined for any other value.
 */
export function materialOf({ property, value, materials }: {
  property: string;
  value: string;
  materials: readonly Material[];
}) {
  const isBackdrop = property === BACKDROP;
  const name = value.trim().replaceAll(/^["']|["']$/gu, "");
  return isBackdrop ? materials.find(material => material.name === name) : undefined;
}
