import { parseNumber } from "./values.ts";

// Angles, apart from the other values so that a window carries them only when a
// sheet uses a gradient or a transform. WinUI's angles are degrees: no other unit.

const DEGREES_PER_HALF_TURN = 180;
const ANGLE = /^(-?(?:\d+\.?\d*|\.\d+))deg$/iu;

/** An angle in degrees (`45deg`, or a bare 0); null for anything else. */
export function parseDegrees(token: string) {
  const isZero = parseNumber(token) === 0;
  if (isZero) {
    return 0;
  }

  const match = ANGLE.exec(token);
  return match === null ? null : Number(match[1]);
}

/** An angle in radians (`deg`, or a bare 0); null for anything else. */
export function parseAngle(token: string) {
  const degrees = parseDegrees(token);
  return degrees === null ? null : degrees / DEGREES_PER_HALF_TURN * Math.PI;
}
