import type { FinderCandidate } from "./qr-finder.ts";
import type { Point } from "#src/barcode/barcode-types.js";

const MAXIMUM_CANDIDATES = 10;
const MAXIMUM_TRIPLES = 12;
const FINDER_SPAN = 7;
const SIZE_SPREAD = 1.6;
const SIDE_SPREAD = 2;
const RIGHT_ANGLE_TOLERANCE = 0.3;

/** Three finder patterns that could be one QR code's corners, told apart by role. */
export interface Triple {
  readonly topLeft: FinderCandidate;
  readonly topRight: FinderCandidate;
  readonly bottomLeft: FinderCandidate;
  /** How far from a right isosceles triangle they are; lower is likelier. */
  readonly score: number;
}

function distanceBetween({ from, to }: {
  readonly from: Point;
  readonly to: Point;
}) {
  return Math.hypot(from.x - to.x, from.y - to.y);
}

// The finder opposite the longest side is the top-left one; the other two are told apart by which
// way round they lie (a mirrored code reverses it, which the transposed decode undoes).
function arrange(candidates: readonly FinderCandidate[]) {
  const sizes = candidates.map(candidate => candidate.moduleSize);
  const isSizeSpread = Math.max(...sizes) > Math.min(...sizes) * SIZE_SPREAD;
  const sides = candidates.map((corner, i) => ({
    corner,
    others: candidates.filter((_, j) => j !== i),
    length: distanceBetween({
      from: candidates[(i + 1) % candidates.length] ?? corner,
      to: candidates[(i + 2) % candidates.length] ?? corner
    })
  }));
  const [longest] = sides.sort((left, right) => right.length - left.length);
  const corner = longest?.corner;
  const [one, other] = longest?.others ?? [];
  const isUnusable = isSizeSpread || !corner || !one || !other;
  if (isUnusable) {
    return undefined;
  }

  const lengthOne = distanceBetween({
    from: corner,
    to: one
  });
  const lengthOther = distanceBetween({
    from: corner,
    to: other
  });
  const isLopsided = Math.max(lengthOne, lengthOther) > Math.min(lengthOne, lengthOther) * SIDE_SPREAD;
  const expected = lengthOne * lengthOne + lengthOther * lengthOther;
  const deviation = Math.abs((longest?.length ?? 0) ** 2 - expected) / expected;
  const isSkewed = deviation > RIGHT_ANGLE_TOLERANCE;
  const isTooClose = Math.min(lengthOne, lengthOther) < corner.moduleSize * FINDER_SPAN;
  const isImplausible = isLopsided || isSkewed || isTooClose;
  if (isImplausible) {
    return undefined;
  }

  const cross = (one.x - corner.x) * (other.y - corner.y) - (one.y - corner.y) * (other.x - corner.x);
  const isOneRight = cross > 0;
  return {
    topLeft: corner,
    topRight: isOneRight ? one : other,
    bottomLeft: isOneRight ? other : one,
    score: deviation + Math.abs(lengthOne - lengthOther) / Math.max(lengthOne, lengthOther)
  };
}

function threesOf(items: readonly FinderCandidate[]) {
  const threes: FinderCandidate[][] = [];
  for (const [i, first] of items.entries()) {
    for (const [j, second] of items.slice(i + 1).entries()) {
      for (const third of items.slice(i + j + 2)) {
        threes.push([first, second, third]);
      }
    }
  }
  return threes;
}

/** The likeliest corner triples among the best-sighted candidates, best first. */
export function findTriples(candidates: readonly FinderCandidate[]) {
  const triples: Triple[] = [];
  for (const three of threesOf(candidates.slice(0, MAXIMUM_CANDIDATES))) {
    const arranged = arrange(three);
    if (arranged) {
      triples.push(arranged);
    }
  }
  return triples.sort((left, right) => left.score - right.score).slice(0, MAXIMUM_TRIPLES);
}
