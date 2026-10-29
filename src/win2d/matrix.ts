import type { Matrix3x2 } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";

// 2D transforms as Win2D's Matrix3x2 (row vectors: a point is multiplied from
// the left, so `multiply({ first, then })` applies `first`, then `then`).

/** The transform that changes nothing. */
export const IDENTITY: Matrix3x2 = {
  m11: 1,
  m12: 0,
  m21: 0,
  m22: 1,
  m31: 0,
  m32: 0
};

/** Moves by x and y. */
export function translation({ x, y }: {
  x: number;
  y: number;
}) {
  return {
    ...IDENTITY,
    m31: x,
    m32: y
  };
}

/** Scales by x and y around a center (the origin by default). */
export function scaling({ x, y, centerX = 0, centerY = 0 }: {
  x: number;
  y: number;
  centerX?: number;
  centerY?: number;
}) {
  return {
    ...IDENTITY,
    m11: x,
    m22: y,
    m31: centerX - x * centerX,
    m32: centerY - y * centerY
  };
}

/** Turns by an angle in radians around a center (the origin by default). */
export function rotation({ radians, centerX = 0, centerY = 0 }: {
  radians: number;
  centerX?: number;
  centerY?: number;
}) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    m11: cosine,
    m12: sine,
    m21: -sine,
    m22: cosine,
    m31: centerX - centerX * cosine + centerY * sine,
    m32: centerY - centerX * sine - centerY * cosine
  };
}

/** The transform that applies `first`, then `then`. */
export function multiply({ first, then }: {
  first: Matrix3x2;
  then: Matrix3x2;
}) {
  return {
    m11: first.m11 * then.m11 + first.m12 * then.m21,
    m12: first.m11 * then.m12 + first.m12 * then.m22,
    m21: first.m21 * then.m11 + first.m22 * then.m21,
    m22: first.m21 * then.m12 + first.m22 * then.m22,
    m31: first.m31 * then.m11 + first.m32 * then.m21 + then.m31,
    m32: first.m31 * then.m12 + first.m32 * then.m22 + then.m32
  };
}
