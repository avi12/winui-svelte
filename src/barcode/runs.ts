import type { BitMatrix } from "./bit-matrix.ts";

/** A stretch of equally coloured pixels along a row or column. */
export interface Run {
  readonly start: number;
  readonly width: number;
  readonly isBlack: boolean;
}

/** The runs of row (or column) `index` of `matrix`, from its start to its end. */
export function runsOfLine({ matrix, index, isColumn }: {
  readonly matrix: BitMatrix;
  readonly index: number;
  readonly isColumn: boolean;
}) {
  const offset = isColumn ? index : index * matrix.width;
  const stride = isColumn ? matrix.width : 1;
  const length = isColumn ? matrix.height : matrix.width;
  const runs: Run[] = [];
  let start = 0;
  let isBlack = matrix.bits[offset] === 1;
  for (let position = 1; position < length; position++) {
    const isBlackHere = matrix.bits[offset + position * stride] === 1;
    const isChange = isBlackHere !== isBlack;
    if (isChange) {
      runs.push({
        start,
        width: position - start,
        isBlack
      });
      start = position;
      isBlack = isBlackHere;
    }
  }
  runs.push({
    start,
    width: length - start,
    isBlack
  });
  return runs;
}
