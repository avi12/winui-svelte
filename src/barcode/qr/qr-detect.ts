import type { FinderCandidate } from "./qr-finder.ts";
import { findFinderCandidates } from "./qr-finder.ts";
import { decodeAt } from "./qr-sampler.ts";
import type { Triple } from "./qr-triples.ts";
import { findTriples } from "./qr-triples.ts";
import type { Point } from "#src/barcode/barcode-types.js";
import type { BitMatrix } from "#src/barcode/bit-matrix.js";

const QUARTER_TURN = Math.PI / 2;
const FINDER_SPAN = 7;
const SMALLEST_DIMENSION = 21;
const LARGEST_DIMENSION = 177;
const DIMENSION_STEP = 4;
const FINDER_COUNT = 3;

/** A QR code found and read. */
interface QrDetection {
  readonly text: string;
  /** The corners of the symbol in the image: top-left, top-right, bottom-right, bottom-left, as the code reads. */
  readonly corners: readonly Point[];
}

function distanceBetween({ from, to }: {
  readonly from: Point;
  readonly to: Point;
}) {
  return Math.hypot(from.x - to.x, from.y - to.y);
}

// The sides the symbol could have, likeliest first: the finder-to-finder distance in modules, plus
// seven, snapped to the next side a version has, and its neighbours.
function dimensionCandidates(triple: Triple) {
  const { topLeft, topRight, bottomLeft } = triple;
  const measuredSize = (topLeft.moduleSize + topRight.moduleSize + bottomLeft.moduleSize) / FINDER_COUNT;
  // A scan line crosses a code turned by an angle from upright 1 / cos(angle) times too long,
  // folded into 45 degrees either way.
  const angle = Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x);
  const foldedAngle = ((angle + QUARTER_TURN / 2 + Math.PI * 2) % QUARTER_TURN) - QUARTER_TURN / 2;
  const moduleSize = measuredSize * Math.cos(foldedAngle);
  const side = (distanceBetween({
    from: topLeft,
    to: topRight
  }) + distanceBetween({
    from: topLeft,
    to: bottomLeft
  })) / 2;
  const estimate = side / moduleSize + FINDER_SPAN;
  const nearest = SMALLEST_DIMENSION + DIMENSION_STEP * Math.round((estimate - SMALLEST_DIMENSION) / DIMENSION_STEP);
  return [nearest, nearest - DIMENSION_STEP, nearest + DIMENSION_STEP]
    .filter(dimension => dimension >= SMALLEST_DIMENSION && dimension <= LARGEST_DIMENSION);
}

function readTriple({ matrix, triple }: {
  readonly matrix: BitMatrix;
  readonly triple: Triple;
}) {
  for (const dimension of dimensionCandidates(triple)) {
    const detection = decodeAt({
      matrix,
      triple,
      dimension
    });
    if (detection) {
      return detection;
    }
  }
  return undefined;
}

/** Finds and decodes every QR code in `matrix` (black modules on white). */
export function detectQrCodes(matrix: BitMatrix) {
  const found: QrDetection[] = [];
  const used = new Set<FinderCandidate>();
  for (const triple of findTriples(findFinderCandidates(matrix))) {
    const members = [triple.topLeft, triple.topRight, triple.bottomLeft];
    const isUsed = members.some(member => used.has(member));
    const detection = isUsed
      ? undefined
      : readTriple({
        matrix,
        triple
      });
    if (detection) {
      found.push(detection);
      for (const member of members) {
        used.add(member);
      }
    }
  }
  return found;
}
