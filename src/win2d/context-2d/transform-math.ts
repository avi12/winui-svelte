import { IDENTITY } from "#src/win2d/matrix.js";
import type { Matrix3x2, Vector2 } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";

const SINGULAR_DETERMINANT = 1e-12;

/** Where a matrix moves a point. */
export function applyToPoint({ matrix, x, y }: {
  matrix: Matrix3x2;
  x: number;
  y: number;
}) {
  return {
    x: x * matrix.m11 + y * matrix.m21 + matrix.m31,
    y: x * matrix.m12 + y * matrix.m22 + matrix.m32
  } satisfies Vector2;
}

/** Whether a matrix has an inverse. */
export function isInvertible(matrix: Matrix3x2) {
  return Math.abs(matrix.m11 * matrix.m22 - matrix.m12 * matrix.m21) > SINGULAR_DETERMINANT;
}

/** The matrix that undoes another (the identity when there is none). */
export function invert(matrix: Matrix3x2) {
  const determinant = matrix.m11 * matrix.m22 - matrix.m12 * matrix.m21;
  const isSingular = Math.abs(determinant) <= SINGULAR_DETERMINANT;
  if (isSingular) {
    return IDENTITY;
  }

  return {
    m11: matrix.m22 / determinant,
    m12: -matrix.m12 / determinant,
    m21: -matrix.m21 / determinant,
    m22: matrix.m11 / determinant,
    m31: (matrix.m21 * matrix.m32 - matrix.m22 * matrix.m31) / determinant,
    m32: (matrix.m12 * matrix.m31 - matrix.m11 * matrix.m32) / determinant
  } satisfies Matrix3x2;
}

/** Whether a matrix is the identity. */
export function isIdentityMatrix(matrix: Matrix3x2) {
  const isLinearIdentity = matrix.m11 === IDENTITY.m11 && matrix.m12 === IDENTITY.m12;
  const isShapeIdentity = matrix.m21 === IDENTITY.m21 && matrix.m22 === IDENTITY.m22;
  const isOriginIdentity = matrix.m31 === IDENTITY.m31 && matrix.m32 === IDENTITY.m32;
  return isLinearIdentity && isShapeIdentity && isOriginIdentity;
}

/** Whether every number of a matrix is finite. */
export function isFiniteMatrix(matrix: Matrix3x2) {
  return Object.values(matrix).every(Number.isFinite);
}
