import { parseNumber } from "./values.ts";

// Angles, apart from the other values so that a window carries them only when a
// sheet uses a gradient or a transform.

const GRADIANS_PER_TURN = 400;
const DEGREES_PER_TURN = 360;
const DEGREE_FRACTION_DIGITS = 6;
const ANGLE = /^(-?(?:\d+\.?\d*|\.\d+))(deg|grad|rad|turn)$/iu;
const TURNS_PER_UNIT = new Map([
  ["deg", 1 / DEGREES_PER_TURN],
  ["grad", 1 / GRADIANS_PER_TURN],
  ["rad", 1 / (2 * Math.PI)],
  ["turn", 1]
]);

// An angle in turns: `45deg`, `0.5turn`, `1.2rad`, `100grad`; a bare 0 is an angle in CSS.
function parseTurns(token: string) {
  const isZero = parseNumber(token) === 0;
  if (isZero) {
    return 0;
  }

  const match = ANGLE.exec(token);
  const isMatchMissing = match === null;
  if (isMatchMissing) {
    return null;
  }

  return (TURNS_PER_UNIT.get((match[2] ?? "").toLowerCase()) ?? 0) * Number(match[1]);
}

/** An angle in radians (`deg`, `grad`, `rad`, `turn`, or a bare 0); null for anything else. */
export function parseAngle(token: string) {
  const turns = parseTurns(token);
  return turns === null ? null : turns * 2 * Math.PI;
}

/** An angle in degrees, without the rounding noise of a unit conversion; null for anything else. */
export function parseDegrees(token: string) {
  const turns = parseTurns(token);
  return turns === null ? null : Number((turns * DEGREES_PER_TURN).toFixed(DEGREE_FRACTION_DIGITS));
}
