import type { Point } from "./barcode-types.ts";

const UNKNOWNS = 8;
const POINT_COUNT = 4;
const SINGULAR_LIMIT = 1e-10;

/**
 * A projective map of the plane: x' = (scaleX x + skewX y + shiftX) / w and
 * y' = (skewY x + scaleY y + shiftY) / w, with w = perspectiveX x + perspectiveY y + 1.
 */
export interface Homography {
  readonly scaleX: number;
  readonly skewX: number;
  readonly shiftX: number;
  readonly skewY: number;
  readonly scaleY: number;
  readonly shiftY: number;
  readonly perspectiveX: number;
  readonly perspectiveY: number;
}

function equationsOf({ from, to }: {
  readonly from: readonly Point[];
  readonly to: readonly Point[];
}) {
  const rows: number[][] = [];
  for (const [i, source] of from.entries()) {
    const target = to[i];
    if (target) {
      const { x, y } = source;
      rows.push([x, y, 1, 0, 0, 0, -x * target.x, -y * target.x, target.x]);
      rows.push([0, 0, 0, x, y, 1, -x * target.y, -y * target.y, target.y]);
    }
  }
  return rows;
}

function pivotRowOf({ rows, column }: {
  readonly rows: readonly number[][];
  readonly column: number;
}) {
  let pivot = column;
  for (let row = column + 1; row < UNKNOWNS; row++) {
    const isLarger = Math.abs(rows[row]?.[column] ?? 0) > Math.abs(rows[pivot]?.[column] ?? 0);
    if (isLarger) {
      pivot = row;
    }
  }
  return pivot;
}

function subtractPivot({ rows, column, pivotRow }: {
  readonly rows: readonly number[][];
  readonly column: number;
  readonly pivotRow: readonly number[];
}) {
  for (const [iRow, target] of rows.entries()) {
    const factor = (target[column] ?? 0) / (pivotRow[column] ?? 1);
    const isEliminated = iRow !== column && factor !== 0;
    for (let i = column; isEliminated && i <= UNKNOWNS; i++) {
      target[i] = (target[i] ?? 0) - factor * (pivotRow[i] ?? 0);
    }
  }
}

function eliminateColumn({ rows, column }: {
  readonly rows: number[][];
  readonly column: number;
}) {
  const pivot = pivotRowOf({
    rows,
    column
  });
  const pivotRow = rows[pivot];
  const current = rows[column];
  const isSingular = !pivotRow || !current || Math.abs(pivotRow[column] ?? 0) < SINGULAR_LIMIT;
  if (isSingular) {
    return false;
  }

  rows[column] = pivotRow;
  rows[pivot] = current;
  subtractPivot({
    rows,
    column,
    pivotRow
  });
  return true;
}

/**
 * The projective map that takes the four `from` points to the four `to`
 * points, or `undefined` when they are degenerate (three on a line).
 */
export function createHomography({ from, to }: {
  readonly from: readonly Point[];
  readonly to: readonly Point[];
}) {
  const rows = equationsOf({
    from,
    to
  });
  const isComplete = from.length === POINT_COUNT && rows.length === UNKNOWNS;
  if (!isComplete) {
    return undefined;
  }

  for (let column = 0; column < UNKNOWNS; column++) {
    const isEliminated = eliminateColumn({
      rows,
      column
    });
    if (!isEliminated) {
      return undefined;
    }
  }
  const [
    scaleX = 0,
    skewX = 0,
    shiftX = 0,
    skewY = 0,
    scaleY = 0,
    shiftY = 0,
    perspectiveX = 0,
    perspectiveY = 0
  ] = rows.map((row, i) => (row[UNKNOWNS] ?? 0) / (row[i] ?? 1));
  return {
    scaleX,
    skewX,
    shiftX,
    skewY,
    scaleY,
    shiftY,
    perspectiveX,
    perspectiveY
  };
}

/** Where `point` goes under `homography`. */
export function applyHomography({ homography, point }: {
  readonly homography: Homography;
  readonly point: Point;
}) {
  const { scaleX, skewX, shiftX, skewY, scaleY, shiftY, perspectiveX, perspectiveY } = homography;
  const divisor = perspectiveX * point.x + perspectiveY * point.y + 1;
  return {
    x: (scaleX * point.x + skewX * point.y + shiftX) / divisor,
    y: (skewY * point.x + scaleY * point.y + shiftY) / divisor
  };
}
