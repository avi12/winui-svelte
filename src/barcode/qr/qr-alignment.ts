import type { Point } from "#src/barcode/barcode-types.js";
import type { BitMatrix } from "#src/barcode/bit-matrix.js";

const SEARCH_RADIUS_MODULES = 4;
const COARSE_STEP = 0.5;
const FINE_STEP = 0.25;
const PATTERN_RADIUS = 2;
const MINIMUM_SCORE = 22;

/** The image-space steps of one module across and down a symbol. */
export interface ModuleVectors {
  readonly across: Point;
  readonly down: Point;
}

function scoreAt({ matrix, center, vectors }: {
  readonly matrix: BitMatrix;
  readonly center: Point;
  readonly vectors: ModuleVectors;
}) {
  const { across, down } = vectors;
  let score = 0;
  for (let row = -PATTERN_RADIUS; row <= PATTERN_RADIUS; row++) {
    for (let column = -PATTERN_RADIUS; column <= PATTERN_RADIUS; column++) {
      const x = Math.floor(center.x + column * across.x + row * down.x);
      const y = Math.floor(center.y + column * across.y + row * down.y);
      // The 5 by 5 pattern: dark centre and rim, a light ring between.
      const isExpectedBlack = Math.max(Math.abs(row), Math.abs(column)) !== 1;
      score += matrix.isBlackAt({
        x,
        y
      }) === isExpectedBlack ? 1 : 0;
    }
  }
  return score;
}

function search({ matrix, estimate, vectors, radius, step }: {
  readonly matrix: BitMatrix;
  readonly estimate: Point;
  readonly vectors: ModuleVectors;
  readonly radius: number;
  readonly step: number;
}) {
  let best: {
    readonly center: Point;
    readonly score: number;
  } | undefined;
  for (let row = -radius; row <= radius; row += step) {
    for (let column = -radius; column <= radius; column += step) {
      const center = {
        x: estimate.x + column * vectors.across.x + row * vectors.down.x,
        y: estimate.y + column * vectors.across.y + row * vectors.down.y
      };
      const score = scoreAt({
        matrix,
        center,
        vectors
      });
      const isBetter = score > (best?.score ?? -1);
      if (isBetter) {
        best = {
          center,
          score
        };
      }
    }
  }
  return best;
}

/**
 * Looks for the alignment pattern (the small concentric square near a symbol's
 * bottom-right corner) around where an affine guess puts it; returns its
 * centre, or `undefined` when nothing there matches.
 */
export function findAlignment({ matrix, estimate, vectors }: {
  readonly matrix: BitMatrix;
  readonly estimate: Point;
  readonly vectors: ModuleVectors;
}) {
  const coarse = search({
    matrix,
    estimate,
    vectors,
    radius: SEARCH_RADIUS_MODULES,
    step: COARSE_STEP
  });
  if (!coarse) {
    return undefined;
  }

  const fine = search({
    matrix,
    estimate: coarse.center,
    vectors,
    radius: COARSE_STEP,
    step: FINE_STEP
  });
  const isFound = (fine?.score ?? 0) >= MINIMUM_SCORE;
  return isFound ? fine?.center : undefined;
}
