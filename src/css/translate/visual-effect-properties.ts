import type { GroupInput, PropertyGroup, WriteContext } from "./property-kit.ts";
import type { ClipShape } from "#src/css/parse/clip-shapes.js";
import { parseFilterList } from "#src/css/parse/filters.js";
import {
  isNoEffect,
  maskShorthandImage,
  NO_EFFECTS,
  parseBlendMode,
  parseMaskImage,
  readVisualEffects,
  writeVisualEffects
} from "#src/css/parse/visual-effects.js";
import type { VisualEffects } from "#src/css/parse/visual-effects.js";

// `filter`, `backdrop-filter`, `mix-blend-mode`, `mask` and `mask-image`: the
// effect graph of one element's visual. They are one group because they make
// one graph: the build says it as one write, the window draws the element
// through it (src/win2d/element-visual.ts).

const FILTER = "filter";
const BACKDROP_FILTER = "backdrop-filter";
const BLEND_MODE = "mix-blend-mode";
const MASK = "mask";
const MASK_IMAGE = "mask-image";
const EFFECTS_TARGET = "visual-effects";

/** What a window does to an element's visual: the seam of the write handlers, so they run under `node --test`. */
export interface VisualHost {
  /** Draws the control through the effects, or without them for `NO_EFFECTS`. */
  setEffects(input: {
    control: object;
    effects: VisualEffects;
  }): void;

  /** Clips the control to the shape, or no more for null. */
  setClip(input: {
    control: object;
    shape: ClipShape | null;
  }): void;
}

function readFilter({ input, member }: {
  input: GroupInput;
  member: string;
}) {
  const reader = input.reading(member);
  const result = parseFilterList(reader.declaration.value);
  if (!result.isValid) {
    reader.error(`${member}: ${result.reason}`);
    return [];
  }

  const hasShadow = member === BACKDROP_FILTER && result.steps.some(step => step.kind === "shadow");
  if (hasShadow) {
    reader.error(`${member}: drop-shadow() draws outside the element, where there is no backdrop to filter`);
    return [];
  }

  return [...result.steps];
}

function readBlend(input: GroupInput) {
  const reader = input.reading(BLEND_MODE);
  const result = parseBlendMode(reader.declaration.value);
  if (!result.isValid) {
    reader.error(`${BLEND_MODE}: ${result.reason}`);
    return null;
  }

  return result.mode;
}

function readMask(input: GroupInput) {
  const isLonghand = input.computed.has(MASK_IMAGE);
  const member = isLonghand ? MASK_IMAGE : MASK;
  const reader = input.reading(member);
  const text = isLonghand ? reader.declaration.value : maskShorthandImage(reader.declaration.value);
  const result = parseMaskImage(text);
  if (!result.isValid) {
    reader.error(`${member}: ${result.reason}`);
    return null;
  }

  for (const warning of result.warnings) {
    reader.warn(`${member}: ${warning}`);
  }

  return result.mask;
}

function lowerEffects(input: GroupInput) {
  const has = (member: string) => input.computed.has(member);
  const hasMask = has(MASK) || has(MASK_IMAGE);
  const effects = {
    filter: has(FILTER) ? readFilter({
      input,
      member: FILTER
    }) : [],
    backdrop: has(BACKDROP_FILTER) ? readFilter({
      input,
      member: BACKDROP_FILTER
    }) : [],
    blend: has(BLEND_MODE) ? readBlend(input) : null,
    mask: hasMask ? readMask(input) : null
  } satisfies VisualEffects;
  return isNoEffect(effects) ? [] : [{
    kind: "write",
    target: EFFECTS_TARGET,
    value: writeVisualEffects(effects)
  } as const];
}

function draw({ host, context }: {
  host: VisualHost;
  context: WriteContext;
}) {
  host.setEffects({
    control: context.control,
    effects: readVisualEffects(context.value)
  });
  return () => host.setEffects({
    control: context.control,
    effects: NO_EFFECTS
  });
}

/**
 * The property group of `filter`, `backdrop-filter`, `mix-blend-mode`, `mask`
 * and `mask-image`. Apart from the built-in groups, so a window whose sheets
 * use none carries none of it (and none of Win2D). `host` is what draws the
 * effects: the window's is `winui-svelte/css/filter`'s; the build needs none.
 */
export function visualEffectGroups(host?: VisualHost) {
  return [{
    members: [FILTER, BACKDROP_FILTER, BLEND_MODE, MASK, MASK_IMAGE],
    lower: lowerEffects,
    writes: {
      [EFFECTS_TARGET]: context => host === undefined ? null : draw({
        host,
        context
      })
    }
  }] satisfies PropertyGroup[];
}

/** The members the visual effect group is lowered from. */
export const VISUAL_EFFECT_MEMBERS = [FILTER, BACKDROP_FILTER, BLEND_MODE, MASK, MASK_IMAGE];
