import type { Vector2 } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";

// Elliptical arcs as cubic Bezier curves, one per quarter turn at most.

const FULL_TURN = 2 * Math.PI;
const QUARTER_TURN = Math.PI / 2;
const BEZIER_ARC_QUARTERS = 4;
const BEZIER_ARC_THIRDS = 3;
const BEZIER_ARC_FACTOR = BEZIER_ARC_QUARTERS / BEZIER_ARC_THIRDS;
const QUARTER_TOLERANCE = 1e-9;

/** An arc of an ellipse, in angles from its x axis (clockwise on a y-down screen when the sweep is positive). */
export interface EllipseArc {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;

  /** Turns the ellipse around its center, in radians. */
  rotation: number;
  startAngle: number;

  /** Signed angle travelled: positive is clockwise, in radians. */
  sweep: number;
}

/** One cubic curve of an arc. */
interface Cubic {
  control1: Vector2;
  control2: Vector2;
  end: Vector2;
}

/**
 * The signed angle from a start to an end angle in the direction given, as the
 * Canvas arc() defines it: a full turn when the angles are a turn or more apart.
 */
export function sweepBetween({ startAngle, endAngle, isCounterclockwise }: {
  startAngle: number;
  endAngle: number;
  isCounterclockwise: boolean;
}) {
  const delta = isCounterclockwise ? startAngle - endAngle : endAngle - startAngle;
  const direction = isCounterclockwise ? -1 : 1;
  const isFullTurn = delta >= FULL_TURN;
  if (isFullTurn) {
    return direction * FULL_TURN;
  }

  return direction * (delta - FULL_TURN * Math.floor(delta / FULL_TURN));
}

/** The point of an ellipse at an angle. */
export function ellipsePoint({ arc, angle }: {
  arc: Pick<EllipseArc, "centerX" | "centerY" | "radiusX" | "radiusY" | "rotation">;
  angle: number;
}) {
  const cosine = Math.cos(arc.rotation);
  const sine = Math.sin(arc.rotation);
  const localX = arc.radiusX * Math.cos(angle);
  const localY = arc.radiusY * Math.sin(angle);
  return {
    x: arc.centerX + localX * cosine - localY * sine,
    y: arc.centerY + localX * sine + localY * cosine
  } satisfies Vector2;
}

function ellipseTangent({ arc, angle }: {
  arc: EllipseArc;
  angle: number;
}) {
  const cosine = Math.cos(arc.rotation);
  const sine = Math.sin(arc.rotation);
  const localX = -arc.radiusX * Math.sin(angle);
  const localY = arc.radiusY * Math.cos(angle);
  return {
    x: localX * cosine - localY * sine,
    y: localX * sine + localY * cosine
  } satisfies Vector2;
}

/** The cubic curves that follow an arc from its start point. */
export function arcCubics(arc: EllipseArc) {
  const count = Math.max(1, Math.ceil(Math.abs(arc.sweep) / QUARTER_TURN - QUARTER_TOLERANCE));
  const step = arc.sweep / count;
  const handle = BEZIER_ARC_FACTOR * Math.tan(step / BEZIER_ARC_QUARTERS);
  return Array.from({ length: count }, (_cubic, i) => {
    const from = arc.startAngle + i * step;
    const to = from + step;
    const start = ellipsePoint({
      arc,
      angle: from
    });
    const end = ellipsePoint({
      arc,
      angle: to
    });
    const startTangent = ellipseTangent({
      arc,
      angle: from
    });
    const endTangent = ellipseTangent({
      arc,
      angle: to
    });
    return {
      control1: {
        x: start.x + handle * startTangent.x,
        y: start.y + handle * startTangent.y
      },
      control2: {
        x: end.x - handle * endTangent.x,
        y: end.y - handle * endTangent.y
      },
      end
    } satisfies Cubic;
  });
}
