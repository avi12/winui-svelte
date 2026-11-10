import type { Run } from "#src/barcode/runs.js";

/** The pixels from the nearest edge to the farthest of two runs, whichever way the line was read. */
export function extentOf({ first, last }: {
  readonly first: Run;
  readonly last: Run;
}) {
  return {
    from: Math.min(first.start, last.start),
    to: Math.max(first.start + first.width, last.start + last.width)
  };
}
