import type { Severity } from "./types.ts";

/** What WinUI makes of one kind of CSS grid track that is not `auto`, a length or `fr`. */
export interface GridTrackVerdict {
  /** A global pattern that finds the track in a `grid-template-*` value. */
  pattern: RegExp;
  severity: Severity;
  /** The track as the author wrote it, named in the message. */
  what(match: RegExpExecArray): string;
  /** Why, in a few words: the message reads `<what> <reason>: <advice>`. */
  reason: string;
  /** What to write instead. */
  advice: string;
}

/**
 * THE grid track table: the CSS tracks that have no (or only a partial) WinUI
 * equivalent. A WinUI track is Auto, a pixel size or a star size, and they
 * mix freely, so `auto`, `px` and `fr` are not here: they map one to one.
 * `repeat(N, ...)` is expanded at build time and is not here either.
 */
export const GRID_TRACK_VERDICTS: readonly GridTrackVerdict[] = [
  {
    pattern: /repeat\(\s*auto-(?:fill|fit)\b/giu,
    severity: "error",
    what: match => `${match[0].replace(/\s+/gu, "")}, ...)`,
    reason: "has no WinUI equivalent",
    advice: "write explicit tracks, for example repeat(3, 1fr) or 1fr 1fr 1fr"
  },
  {
    pattern: /(?<![\w-])subgrid(?![\w-])/giu,
    severity: "error",
    what: () => "subgrid",
    reason: "has no WinUI equivalent",
    advice: "give the nested grid its own grid-template-columns and grid-template-rows"
  },
  {
    pattern: /(?<![\w-])masonry(?![\w-])/giu,
    severity: "error",
    what: () => "masonry",
    reason: "has no WinUI equivalent",
    advice: "use explicit tracks, or an {#each} over several stack-panels"
  },
  {
    pattern: /\[[^\]]*\]/gu,
    severity: "error",
    what: match => `the named line ${match[0]}`,
    reason: "has no WinUI equivalent",
    advice: "drop the name and place children with grid-column and grid-row numbers"
  },
  {
    pattern: /(?<![\w.-])-?\d*\.?\d+%/gu,
    severity: "error",
    what: match => `the % track ${match[0]}`,
    reason: "has no WinUI equivalent",
    advice: "use fr tracks (a quarter of the width is one of four 1fr columns), or px"
  },
  {
    pattern: /(?<![\w-])(?:min-content|max-content)(?![\w-])/giu,
    severity: "warning",
    what: match => match[0],
    reason: "is only approximated by an Auto track",
    advice: "an Auto track sizes to its content; write auto to say so"
  }
];

/** The properties whose values are read for the tracks above. */
export const GRID_TRACK_PROPERTIES: ReadonlySet<string> = new Set(["grid-template-columns", "grid-template-rows"]);

/**
 * The message for a track WinUI cannot say, such as `repeat(auto-fill, ...) has
 * no WinUI equivalent: ...`; null when the track is fine or only approximated.
 */
export function gridTrackProblem(track: string) {
  for (const verdict of GRID_TRACK_VERDICTS) {
    const match = new RegExp(verdict.pattern.source, "iu").exec(track);
    const isProblem = match !== null && verdict.severity === "error";
    if (isProblem) {
      return `${verdict.what(match)} ${verdict.reason}: ${verdict.advice}`;
    }
  }

  return null;
}
