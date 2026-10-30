// The `@media` queries a Style can follow: the size of the window's content.
// A rule under one applies while the size matches, and the runtime restyles the
// element when the window is resized across a bound.

/** The four bounds of a query. */
type BoundName = "minWidth" | "maxWidth" | "minHeight" | "maxHeight";

/** The bounds, in px, of a width and height query; null where the query sets none. */
export interface MediaCondition {
  minWidth: number | null;
  maxWidth: number | null;
  minHeight: number | null;
  maxHeight: number | null;
  /**
   * Set for an `@container` query: the container's name (empty for the nearest
   * container of any name), whose size the bounds are about. Absent for `@media`.
   */
  container?: string;
  /**
   * The rest of an `@media` query, text the one evaluator (media/query.ts)
   * reads: `(prefers-reduced-motion: reduce)`. The bounds above are the size
   * terms of a query that has only those.
   */
  query?: string;
}

/** The size of the window's content, in px. */
export interface Viewport {
  width: number;
  height: number;
}

const PIXELS_PER_REM = 16;
const AMOUNT = String.raw`(?<amount>\d*\.?\d+)(?<unit>px|rem|em)`;
const FEATURE = new RegExp(String.raw`^\(\s*(?<limit>min|max)-(?<axis>width|height)\s*:\s*${AMOUNT}\s*\)$`, "iu");
const RANGE = new RegExp(String.raw`^\(\s*(?<axis>width|height)\s*(?<operator>>=|<=)\s*${AMOUNT}\s*\)$`, "iu");
const MEDIA_TYPE = /^(?:only\s+)?(?:screen|all)\s+and\s+/iu;
const AND = /\s+and\s+/iu;

function limitKey({ isMin, isWidth }: {
  isMin: boolean;
  isWidth: boolean;
}) {
  const keys: ReadonlyMap<string, BoundName> = new Map([
    ["true true", "minWidth"],
    ["true false", "minHeight"],
    ["false true", "maxWidth"],
    ["false false", "maxHeight"]
  ]);
  return keys.get(`${isMin} ${isWidth}`) ?? "minWidth";
}

function termOf(text: string) {
  const groups = FEATURE.exec(text)?.groups ?? RANGE.exec(text)?.groups;
  const { limit, operator, axis = "", amount = "0", unit = "px" } = groups ?? {};
  const isTermMissing = groups === undefined;
  if (isTermMissing) {
    return null;
  }

  const isMin = limit?.toLowerCase() === "min" || operator === ">=";
  const isWidth = axis.toLowerCase() === "width";
  const key = limitKey({
    isMin,
    isWidth
  });
  return {
    key,
    isMin,
    pixels: Number(amount) * (unit.toLowerCase() === "px" ? 1 : PIXELS_PER_REM)
  };
}

/**
 * Reads `(min-width: 600px) and (max-width: 900px)` (and `(width >= 600px)`,
 * and a leading `screen and`) into bounds; null when the query asks about
 * anything else. A bound given twice keeps the tighter one.
 */
export function parseMediaQuery(prelude: string) {
  const condition: MediaCondition = {
    minWidth: null,
    maxWidth: null,
    minHeight: null,
    maxHeight: null
  };
  for (const text of prelude.trim().replace(MEDIA_TYPE, "").split(AND)) {
    const term = termOf(text);
    const isTermMissing = term === null;
    if (isTermMissing) {
      return null;
    }

    const current = condition[term.key];
    const isTighter = current === null || (term.isMin ? term.pixels > current : term.pixels < current);
    if (isTighter) {
      condition[term.key] = term.pixels;
    }
  }

  return condition;
}

/**
 * Reads the prelude of an `@container` rule, `[name] (min-width: 400px)`, into
 * bounds on the nearest container (of that name); null when it asks about
 * anything else (a style query, `inline-size` is read as width).
 */
export function parseContainerQuery(prelude: string) {
  const text = prelude.trim();
  const open = text.indexOf("(");
  const isParenthesized = open >= 0;
  if (!isParenthesized) {
    return null;
  }

  const condition = parseMediaQuery(text.slice(open).replaceAll("inline-size", "width").replaceAll("block-size", "height"));
  return condition === null ? null : {
    ...condition,
    container: text.slice(0, open).trim()
  } satisfies MediaCondition;
}

/** Whether the viewport is inside the bounds; a rule with a query never applies where the size is unknown. */
export function mediaMatches({ media, viewport }: {
  media: MediaCondition;
  viewport: Viewport | null;
}) {
  const isSizeUnknown = viewport === null;
  if (isSizeUnknown) {
    return false;
  }

  const { minWidth, maxWidth, minHeight, maxHeight } = media;
  const isWideEnough = minWidth === null || viewport.width >= minWidth;
  const isNarrowEnough = maxWidth === null || viewport.width <= maxWidth;
  const isTallEnough = minHeight === null || viewport.height >= minHeight;
  const isShortEnough = maxHeight === null || viewport.height <= maxHeight;
  return isWideEnough && isNarrowEnough && isTallEnough && isShortEnough;
}
