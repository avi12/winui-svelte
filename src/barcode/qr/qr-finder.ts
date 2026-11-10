import type { Point } from "#src/barcode/barcode-types.js";
import type { BitMatrix } from "#src/barcode/bit-matrix.js";
import type { Run } from "#src/barcode/runs.js";
import { runsOfLine } from "#src/barcode/runs.js";
import { sumOf } from "#src/barcode/sum-of.js";

const FINDER_MODULES = 7;
const CENTER_MODULES = 3;
const PATTERN_RUNS = 5;
const CENTER_RUN = 2;
const FIRST_RUN_AFTER_CENTER = 3;
const MODULE_TOLERANCE = 0.5;
const PIXEL_SLACK = 0.5;
const SIZE_AGREEMENT = 0.5;
const MINIMUM_SIGHTINGS = 2;
const EXPECTED_MODULES = [1, 1, CENTER_MODULES, 1, 1];

/** Where a finder pattern (the 1:1:3:1:1 square at three corners of a QR code) was seen. */
export interface FinderCandidate extends Point {
  /** The width of one module, in pixels. */
  readonly moduleSize: number;
  /** In how many scan lines it was seen. */
  readonly sightings: number;
}

function isFinderRatio(widths: readonly number[]) {
  const moduleSize = sumOf(widths) / FINDER_MODULES;
  const isTooSmall = moduleSize < 1;
  if (isTooSmall) {
    return false;
  }

  return widths.every((width, i) => {
    const modules = EXPECTED_MODULES[i] ?? 1;
    return Math.abs(width - modules * moduleSize) <= modules * moduleSize * MODULE_TOLERANCE + PIXEL_SLACK;
  });
}

// The five runs (black, white, black, white, black) around a pixel inside
// the black middle one, and where the last of them ends.
function measureRuns({ isBlackAt, center, length }: {
  readonly isBlackAt: (position: number) => boolean;
  readonly center: number;
  readonly length: number;
}) {
  const widths = [0, 0, 0, 0, 0];
  let position = center;
  for (let run = CENTER_RUN; run >= 0; run--) {
    const isBlack = run % 2 === 0;
    while (position >= 0 && isBlackAt(position) === isBlack) {
      widths[run] = (widths[run] ?? 0) + 1;
      position--;
    }
  }
  position = center + 1;
  for (let run = CENTER_RUN; run < PATTERN_RUNS; run++) {
    const isBlack = run % 2 === 0;
    while (position < length && isBlackAt(position) === isBlack) {
      widths[run] = (widths[run] ?? 0) + 1;
      position++;
    }
  }
  return {
    widths,
    end: position
  };
}

/**
 * Walks from a pixel that is inside a finder pattern's black centre along one
 * axis and measures the five runs around it; returns the centre of the pattern
 * on that axis and its extent, or `undefined` when the runs are not 1:1:3:1:1.
 */
function crossCheck({ matrix, x, y, isVertical }: {
  readonly matrix: BitMatrix;
  readonly x: number;
  readonly y: number;
  readonly isVertical: boolean;
}) {
  const length = isVertical ? matrix.height : matrix.width;
  const center = isVertical ? y : x;
  function isBlackAt(position: number) {
    const index = isVertical ? position * matrix.width + x : y * matrix.width + position;
    return matrix.bits[index] === 1;
  }
  const { widths, end } = measureRuns({
    isBlackAt,
    center,
    length
  });
  const isComplete = widths.every(width => width > 0);
  const isUnbalanced = !isComplete || !isFinderRatio(widths);
  if (isUnbalanced) {
    return undefined;
  }

  const after = (widths[FIRST_RUN_AFTER_CENTER] ?? 0) + (widths[PATTERN_RUNS - 1] ?? 0);
  return {
    center: end - after - (widths[CENTER_RUN] ?? 0) / 2,
    extent: sumOf(widths)
  };
}

function merge({ candidates, found }: {
  readonly candidates: FinderCandidate[];
  readonly found: FinderCandidate;
}) {
  const iSame = candidates.findIndex(candidate => {
    const distance = Math.hypot(candidate.x - found.x, candidate.y - found.y);
    const ratio = candidate.moduleSize / found.moduleSize;
    const isNear = distance <= candidate.moduleSize * 2;
    const isSimilar = ratio < 1 + SIZE_AGREEMENT && ratio > 1 / (1 + SIZE_AGREEMENT);
    return isNear && isSimilar;
  });
  const existing = candidates[iSame];
  if (!existing) {
    candidates.push(found);
    return;
  }

  const weight = existing.sightings;
  candidates[iSame] = {
    x: (existing.x * weight + found.x) / (weight + 1),
    y: (existing.y * weight + found.y) / (weight + 1),
    moduleSize: (existing.moduleSize * weight + found.moduleSize) / (weight + 1),
    sightings: weight + 1
  };
}

// The finder pattern the five runs starting at `iRun` of row `y` make, if they make one.
function finderAt({ matrix, y, runs, iRun }: {
  readonly matrix: BitMatrix;
  readonly y: number;
  readonly runs: readonly Run[];
  readonly iRun: number;
}) {
  const window = runs.slice(iRun, iRun + PATTERN_RUNS);
  const widths = window.map(run => run.width);
  if (!isFinderRatio(widths)) {
    return undefined;
  }

  const middle = window[CENTER_RUN];
  const centerX = Math.floor((middle?.start ?? 0) + (middle?.width ?? 0) / 2);
  const vertical = crossCheck({
    matrix,
    x: centerX,
    y,
    isVertical: true
  });
  const horizontal = vertical && crossCheck({
    matrix,
    x: centerX,
    y: Math.floor(vertical.center),
    isVertical: false
  });
  const rowSize = sumOf(widths);
  const isAgreeing = vertical !== undefined && Math.abs(vertical.extent - rowSize) <= rowSize * SIZE_AGREEMENT;
  const isMissing = !horizontal || !vertical || !isAgreeing;
  if (isMissing) {
    return undefined;
  }

  return {
    x: horizontal.center,
    y: vertical.center,
    moduleSize: (horizontal.extent + vertical.extent) / (2 * FINDER_MODULES),
    sightings: 1
  };
}

/** Every finder pattern in the image, best-sighted first. */
export function findFinderCandidates(matrix: BitMatrix) {
  const candidates: FinderCandidate[] = [];
  for (let y = 0; y < matrix.height; y++) {
    const runs = runsOfLine({
      matrix,
      index: y,
      isColumn: false
    });
    for (let iRun = 0; iRun + PATTERN_RUNS <= runs.length; iRun++) {
      const found = runs[iRun]?.isBlack ? finderAt({
        matrix,
        y,
        runs,
        iRun
      }) : undefined;
      if (found) {
        merge({
          candidates,
          found
        });
      }
    }
  }
  return candidates
    .filter(candidate => candidate.sightings >= MINIMUM_SIGHTINGS)
    .sort((left, right) => right.sightings - left.sightings);
}
