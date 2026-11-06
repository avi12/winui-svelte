import { parseColor } from "./colors.ts";
import { splitCommas, splitWords } from "./split.ts";
import { parseLength } from "./values.ts";
import { z } from "zod";

// One layer of `box-shadow`: `[inset] <x> <y> [<blur> [<spread>]] [<color>]`.
// Both ways of drawing it read it with this: a ThemeShadow takes its depth,
// a Composition DropShadow takes all of it.

const MIN_SHADOW_LENGTHS = 2;
const MAX_SHADOW_LENGTHS = 4;
const INSET = "inset";

/** The colour of a shadow that names none (the filter's `drop-shadow()` uses it too). */
export const DEFAULT_SHADOW_COLOR = "#80000000";

const SHADOW = z.object({
  x: z.number(),
  y: z.number(),
  blur: z.number(),
  spread: z.number(),
  color: z.string()
});

/** A shadow layer as the window draws it: lengths in px, a `#AARRGGBB` colour. */
export type ShadowLayer = z.infer<typeof SHADOW>;

/** What one layer of `box-shadow` says, as written. */
interface ParsedShadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  /** The colour written as a literal, or null when none is written or it is a `var()`. */
  color: string | null;
  /** Whether a colour is written that is not a literal (a `var()`), which a build cannot resolve. */
  hasUnresolvedColor: boolean;
  isInset: boolean;
}

function isLengthWord(word: string) {
  return parseLength(word) !== null;
}

/**
 * Reads one layer; null when it is not `x y [blur [spread]] [color]` in any
 * order the CSS grammar allows (the lengths together, the colour and `inset`
 * either side of them).
 */
export function parseShadowLayer(text: string) {
  const words = splitWords(text);
  const isInset = words.some(word => word.toLowerCase() === INSET);
  const rest = words.filter(word => word.toLowerCase() !== INSET);
  const lengths = rest.filter(word => isLengthWord(word)).map(word => parseLength(word) ?? 0);
  const others = rest.filter(word => !isLengthWord(word));
  const hasLengthCount = lengths.length >= MIN_SHADOW_LENGTHS && lengths.length <= MAX_SHADOW_LENGTHS;
  const isShadowRead = hasLengthCount && others.length <= 1;
  if (!isShadowRead) {
    return null;
  }

  const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
  const [word = ""] = others;
  const color = parseColor(word);
  return {
    x,
    y,
    blur,
    spread,
    color,
    hasUnresolvedColor: others.length === 1 && color === null,
    isInset
  } satisfies ParsedShadow;
}

/** The layers of a `box-shadow` value, each parsed, or null where a layer is not one (`none` is no layers). */
export function parseShadowList(text: string) {
  const isNone = text.trim().toLowerCase() === "none";
  if (isNone) {
    return [];
  }

  const layers = splitCommas(text).map(layer => parseShadowLayer(layer));
  return layers.every(layer => layer !== null) ? layers : null;
}

/** The layers a write of the CSS runtime carries, from its JSON. */
export function readShadowLayers(json: string) {
  return z.array(SHADOW).parse(JSON.parse(json));
}
