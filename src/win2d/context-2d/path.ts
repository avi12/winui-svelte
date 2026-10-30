import { arcCubics, ellipsePoint, sweepBetween } from "./arc-math.ts";
import { appendSvgPath } from "./svg-path.ts";
import { applyToPoint, invert } from "./transform-math.ts";
import { IDENTITY } from "#src/win2d/matrix.js";
import type { Matrix3x2, Vector2 } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";

const HALF_TURN = Math.PI;
const QUARTER_TURN = Math.PI / 2;
const COLLINEAR_TOLERANCE = 1e-9;

/** The kinds of step a path is made of. */
export const SegmentKind = {
  MOVE: "move",
  LINE: "line",
  CUBIC: "cubic",
  QUADRATIC: "quadratic",
  CLOSE: "close"
} as const;

/** One step of a path, in the coordinates the path was drawn in. */
export type Segment =
  | {
    kind: typeof SegmentKind.MOVE;
    to: Vector2;
  }
  | {
    kind: typeof SegmentKind.LINE;
    to: Vector2;
  }
  | {
    kind: typeof SegmentKind.CUBIC;
    control1: Vector2;
    control2: Vector2;
    to: Vector2;
  }
  | {
    kind: typeof SegmentKind.QUADRATIC;
    control: Vector2;
    to: Vector2;
  }
  | {
    kind: typeof SegmentKind.CLOSE;
  };

/** The matrix a Path2D is added with: a DOMMatrix's a to f; a missing one is the identity's. */
export interface MatrixInit {
  a?: number | undefined;
  b?: number | undefined;
  c?: number | undefined;
  d?: number | undefined;
  e?: number | undefined;
  f?: number | undefined;
}

/** A corner radius of roundRect: a number, or an elliptical `{ x, y }`. */
export type CornerRadius = number | {
  x?: number;
  y?: number;
};

interface Corner {
  x: number;
  y: number;
}

/** The matrix a DOMMatrix-like object names; a missing member is the identity's. */
export function matrixFromInit(init: MatrixInit) {
  return {
    m11: init.a ?? 1,
    m12: init.b ?? 0,
    m21: init.c ?? 0,
    m22: init.d ?? 1,
    m31: init.e ?? 0,
    m32: init.f ?? 0
  } satisfies Matrix3x2;
}

function cornerOf(radius: CornerRadius) {
  const isNumber = typeof radius === "number";
  return isNumber ? {
    x: radius,
    y: radius
  } : {
    x: radius.x ?? 0,
    y: radius.y ?? 0
  };
}

// The rule of border-radius: one to four values, top left first.
function cornersOf(radii: CornerRadius | CornerRadius[]) {
  const list = Array.isArray(radii) ? radii : [radii];
  const [first = 0, second = first, third = first, fourth = second] = list;
  return [first, second, third, fourth].map(cornerOf);
}

// Radii that would overlap are scaled down together, as the platform does.
function fittedCorners({ corners, width, height }: {
  corners: Corner[];
  width: number;
  height: number;
}) {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const ratios = [
    width / ((topLeft?.x ?? 0) + (topRight?.x ?? 0)),
    width / ((bottomLeft?.x ?? 0) + (bottomRight?.x ?? 0)),
    height / ((topLeft?.y ?? 0) + (bottomLeft?.y ?? 0)),
    height / ((topRight?.y ?? 0) + (bottomRight?.y ?? 0))
  ];
  const scale = Math.min(1, ...ratios.filter(Number.isFinite));
  return corners.map(corner => ({
    x: corner.x * scale,
    y: corner.y * scale
  }));
}

/**
 * A path, as the platform's Path2D: build it with the same calls as a canvas
 * context, then fill, stroke or clip with it. Pass an SVG path string (the `d`
 * of a `<path>`) or another Path2D to start from.
 */
export class Path2D {
  private readonly list: Segment[] = [];
  private current: Vector2 = {
    x: 0,
    y: 0
  };
  private start: Vector2 = {
    x: 0,
    y: 0
  };
  private hasSubpath = false;
  private isOpen = false;

  constructor(source?: Path2D | string) {
    const isPath = source instanceof Path2D;
    if (isPath) {
      this.addPath(source);
      return;
    }

    const isSvg = typeof source === "string";
    if (isSvg) {
      appendSvgPath({
        path: this,
        data: source
      });
    }
  }

  /** The steps of the path so far. */
  get segments() {
    return this.list;
  }

  /** Where a point of the path's own coordinates is kept in the steps. */
  protected project(point: Vector2) {
    return point;
  }

  /** The inverse of `project`. */
  protected unproject(point: Vector2) {
    return point;
  }

  private openAt(point: Vector2) {
    this.list.push({
      kind: SegmentKind.MOVE,
      to: point
    });
    this.start = point;
    this.current = point;
    this.hasSubpath = true;
    this.isOpen = true;
  }

  private continueSubpath() {
    if (!this.isOpen) {
      this.openAt(this.start);
    }
  }

  /** Starts a new subpath at a point. */
  moveTo(x: number, y: number) {
    const isInvalid = !Number.isFinite(x) || !Number.isFinite(y);
    if (isInvalid) {
      return;
    }

    this.openAt(
      this.project({
        x,
        y
      })
    );
  }

  /** Adds a straight line to a point. */
  lineTo(x: number, y: number) {
    const isInvalid = !Number.isFinite(x) || !Number.isFinite(y);
    if (isInvalid) {
      return;
    }

    const to = this.project({
      x,
      y
    });
    if (!this.hasSubpath) {
      this.openAt(to);
      return;
    }

    this.continueSubpath();
    this.list.push({
      kind: SegmentKind.LINE,
      to
    });
    this.current = to;
  }

  /** Closes the subpath with a line back to its start. */
  closePath() {
    if (!this.isOpen) {
      return;
    }

    this.list.push({ kind: SegmentKind.CLOSE });
    this.current = this.start;
    this.isOpen = false;
  }

  /** Adds a cubic Bezier curve. */
  bezierCurveTo(control1X: number, control1Y: number, control2X: number, control2Y: number, x: number, y: number) {
    const isFinite = [control1X, control1Y, control2X, control2Y, x, y].every(Number.isFinite);
    if (!isFinite) {
      return;
    }

    const control1 = this.project({
      x: control1X,
      y: control1Y
    });
    if (!this.hasSubpath) {
      this.openAt(control1);
    }

    this.continueSubpath();
    const to = this.project({
      x,
      y
    });
    this.list.push({
      kind: SegmentKind.CUBIC,
      control1,
      control2: this.project({
        x: control2X,
        y: control2Y
      }),
      to
    });
    this.current = to;
  }

  /** Adds a quadratic Bezier curve. */
  quadraticCurveTo(controlX: number, controlY: number, x: number, y: number) {
    const isFinite = [controlX, controlY, x, y].every(Number.isFinite);
    if (!isFinite) {
      return;
    }

    const control = this.project({
      x: controlX,
      y: controlY
    });
    if (!this.hasSubpath) {
      this.openAt(control);
    }

    this.continueSubpath();
    const to = this.project({
      x,
      y
    });
    this.list.push({
      kind: SegmentKind.QUADRATIC,
      control,
      to
    });
    this.current = to;
  }

  /**
   * Adds an arc of an ellipse: a line from the current point to its start, then
   * the arc. Angles are in radians from the x axis; clockwise unless told
   * otherwise.
   *
   * @throws {RangeError} when a radius is negative
   */
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    isCounterclockwise = false
  ) {
    const isFinite = [x, y, radiusX, radiusY, rotation, startAngle, endAngle].every(Number.isFinite);
    if (!isFinite) {
      return;
    }

    const isNegative = radiusX < 0 || radiusY < 0;
    if (isNegative) {
      throw new RangeError("The radius provided is negative");
    }

    const arc = {
      centerX: x,
      centerY: y,
      radiusX,
      radiusY,
      rotation,
      startAngle,
      sweep: sweepBetween({
        startAngle,
        endAngle,
        isCounterclockwise
      })
    };
    const first = ellipsePoint({
      arc,
      angle: startAngle
    });
    this.lineTo(first.x, first.y);
    const isFlat = radiusX === 0 || radiusY === 0;
    if (isFlat) {
      const last = ellipsePoint({
        arc,
        angle: startAngle + arc.sweep
      });
      this.lineTo(last.x, last.y);
      return;
    }

    for (const cubic of arcCubics(arc)) {
      const { control1, control2, end } = cubic;
      this.bezierCurveTo(control1.x, control1.y, control2.x, control2.y, end.x, end.y);
    }
  }

  /**
   * Adds a circular arc around a center.
   *
   * @throws {RangeError} when the radius is negative
   */
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, isCounterclockwise = false) {
    this.ellipse(x, y, radius, radius, 0, startAngle, endAngle, isCounterclockwise);
  }

  /**
   * Adds an arc of a given radius that touches the line from the current point
   * to the first point and the line from there to the second.
   *
   * @throws {RangeError} when the radius is negative
   */
  arcTo(firstX: number, firstY: number, secondX: number, secondY: number, radius: number) {
    const isFinite = [firstX, firstY, secondX, secondY, radius].every(Number.isFinite);
    if (!isFinite) {
      return;
    }

    const isNegative = radius < 0;
    if (isNegative) {
      throw new RangeError("The radius provided is negative");
    }

    if (!this.hasSubpath) {
      this.moveTo(firstX, firstY);
    }

    const from = this.unproject(this.current);
    const toFirst = {
      x: from.x - firstX,
      y: from.y - firstY
    };
    const toSecond = {
      x: secondX - firstX,
      y: secondY - firstY
    };
    const firstLength = Math.hypot(toFirst.x, toFirst.y);
    const secondLength = Math.hypot(toSecond.x, toSecond.y);
    const cross = toFirst.x * toSecond.y - toFirst.y * toSecond.x;
    const isCollinear = Math.abs(cross) < COLLINEAR_TOLERANCE * firstLength * secondLength;
    const isStraight = firstLength === 0 || secondLength === 0 || radius === 0 || isCollinear;
    if (isStraight) {
      this.lineTo(firstX, firstY);
      return;
    }

    const unitFirst = {
      x: toFirst.x / firstLength,
      y: toFirst.y / firstLength
    };
    const unitSecond = {
      x: toSecond.x / secondLength,
      y: toSecond.y / secondLength
    };
    const halfAngle = Math.acos(unitFirst.x * unitSecond.x + unitFirst.y * unitSecond.y) / 2;
    const tangentLength = radius / Math.tan(halfAngle);
    const bisector = {
      x: unitFirst.x + unitSecond.x,
      y: unitFirst.y + unitSecond.y
    };
    const bisectorLength = Math.hypot(bisector.x, bisector.y);
    const centerDistance = radius / Math.sin(halfAngle);
    const centerX = firstX + bisector.x / bisectorLength * centerDistance;
    const centerY = firstY + bisector.y / bisectorLength * centerDistance;
    const tangentStart = {
      x: firstX + unitFirst.x * tangentLength,
      y: firstY + unitFirst.y * tangentLength
    };
    const tangentEnd = {
      x: firstX + unitSecond.x * tangentLength,
      y: firstY + unitSecond.y * tangentLength
    };
    this.lineTo(tangentStart.x, tangentStart.y);
    const startAngle = Math.atan2(tangentStart.y - centerY, tangentStart.x - centerX);
    const endAngle = Math.atan2(tangentEnd.y - centerY, tangentEnd.x - centerX);
    this.arc(centerX, centerY, radius, startAngle, endAngle, cross > 0);
  }

  /** Adds a closed rectangle. */
  rect(x: number, y: number, width: number, height: number) {
    const isFinite = [x, y, width, height].every(Number.isFinite);
    if (!isFinite) {
      return;
    }

    this.moveTo(x, y);
    this.lineTo(x + width, y);
    this.lineTo(x + width, y + height);
    this.lineTo(x, y + height);
    this.closePath();
  }

  /**
   * Adds a closed rectangle with rounded corners. The radii follow
   * `border-radius`: one to four numbers or `{ x, y }` pairs, top left first.
   *
   * @throws {RangeError} when a radius is negative
   */
  roundRect(x: number, y: number, width: number, height: number, radii: CornerRadius | CornerRadius[] = 0) {
    const isFinite = [x, y, width, height].every(Number.isFinite);
    if (!isFinite) {
      return;
    }

    const corners = cornersOf(radii);
    const isNegative = corners.some(corner => corner.x < 0 || corner.y < 0);
    if (isNegative) {
      throw new RangeError("A radius provided is negative");
    }

    const left = Math.min(x, x + width);
    const top = Math.min(y, y + height);
    const wide = Math.abs(width);
    const high = Math.abs(height);
    const [topLeft, topRight, bottomRight, bottomLeft] = fittedCorners({
      corners,
      width: wide,
      height: high
    });
    const hasCorners = topLeft && topRight && bottomRight && bottomLeft;
    if (!hasCorners) {
      return;
    }

    this.moveTo(left + topLeft.x, top);
    this.lineTo(left + wide - topRight.x, top);
    this.ellipse(left + wide - topRight.x, top + topRight.y, topRight.x, topRight.y, 0, -QUARTER_TURN, 0);
    this.lineTo(left + wide, top + high - bottomRight.y);
    const bottomRightX = left + wide - bottomRight.x;
    const bottomRightY = top + high - bottomRight.y;
    this.ellipse(bottomRightX, bottomRightY, bottomRight.x, bottomRight.y, 0, 0, QUARTER_TURN);
    this.lineTo(left + bottomLeft.x, top + high);
    const bottomLeftY = top + high - bottomLeft.y;
    this.ellipse(left + bottomLeft.x, bottomLeftY, bottomLeft.x, bottomLeft.y, 0, QUARTER_TURN, HALF_TURN);
    this.lineTo(left, top + topLeft.y);
    this.ellipse(left + topLeft.x, top + topLeft.y, topLeft.x, topLeft.y, 0, HALF_TURN, HALF_TURN + QUARTER_TURN);
    this.closePath();
  }

  /** Adds the steps of another path, moved by a matrix. */
  addPath(path: Path2D, transform: MatrixInit = {}) {
    const matrix = matrixFromInit(transform);
    function moved(point: Vector2) {
      return applyToPoint({
        matrix,
        ...point
      });
    }

    for (const segment of path.segments) {
      this.addSegment({
        segment,
        moved
      });
    }
  }

  private addSegment({ segment, moved }: {
    segment: Segment;
    moved: (point: Vector2) => Vector2;
  }) {
    const isClose = segment.kind === SegmentKind.CLOSE;
    if (isClose) {
      this.closePath();
      return;
    }

    const to = moved(segment.to);
    const isMove = segment.kind === SegmentKind.MOVE;
    if (isMove) {
      this.moveTo(to.x, to.y);
    } else if (segment.kind === SegmentKind.LINE) {
      this.lineTo(to.x, to.y);
    } else if (segment.kind === SegmentKind.CUBIC) {
      const control1 = moved(segment.control1);
      const control2 = moved(segment.control2);
      this.bezierCurveTo(control1.x, control1.y, control2.x, control2.y, to.x, to.y);
    } else {
      const control = moved(segment.control);
      this.quadraticCurveTo(control.x, control.y, to.x, to.y);
    }
  }
}

/**
 * The path of a canvas context: what it adds is moved by the transform in force
 * when it is added, so its steps are in device coordinates.
 */
export class DevicePath extends Path2D {
  matrix: Matrix3x2 = IDENTITY;

  protected override project(point: Vector2) {
    return applyToPoint({
      matrix: this.matrix,
      ...point
    });
  }

  protected override unproject(point: Vector2) {
    return applyToPoint({
      matrix: invert(this.matrix),
      ...point
    });
  }
}
