import type { Rectangle, Size } from "#src/capture/region.js";
import { overlapOf, wholeOf } from "#src/capture/region.js";

/** A position, in whatever unit the caller works in (device-independent pixels for pointer events). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A corner or an edge being dragged: the opposite corner or edge stays put as the anchor. */
export interface CornerGrip {
  readonly anchor: Point;

  /** Plus or minus one per axis, away from the anchor; 0 on the axis an edge leaves alone. */
  readonly direction: Point;

  /** The length the selection keeps along an axis whose direction is 0; left out for a corner. */
  readonly held?: Point;
}

/** The distance a press may be from a corner and still take hold of it. */
export const DEFAULT_CORNER_REACH = 28;

/** The smallest side a resized or drawn selection may have. */
export const DEFAULT_MINIMUM_SIZE = 20;

/** A lasso loop narrower or shorter than this was a click or a slip. */
export const DEFAULT_MINIMUM_STROKE = 10;

/** How far a finished lasso loop's box grows, so the loop's own line does not clip what it circled. */
export const DEFAULT_LASSO_PADDING = 16;

function rectangleRight(rectangle: Rectangle) {
  return rectangle.x + rectangle.width;
}

function rectangleBottom(rectangle: Rectangle) {
  return rectangle.y + rectangle.height;
}

function cornersOf(rectangle: Rectangle) {
  const right = rectangleRight(rectangle);
  const bottom = rectangleBottom(rectangle);
  return [
    {
      x: rectangle.x,
      y: rectangle.y
    },
    {
      x: right,
      y: rectangle.y
    },
    {
      x: right,
      y: bottom
    },
    {
      x: rectangle.x,
      y: bottom
    }
  ];
}

/**
 * The distance between two points.
 *
 * @param options - The two points.
 * @returns The straight-line distance.
 */
export function distanceBetween({ first, second }: {
  first: Point;
  second: Point;
}) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

/**
 * The rectangle two opposite corners span, whichever way they were dragged.
 *
 * @param options - The two corners.
 * @returns The rectangle, with a non-negative width and height.
 */
export function rectangleFromPoints({ first, second }: {
  first: Point;
  second: Point;
}) {
  return {
    x: Math.min(first.x, second.x),
    y: Math.min(first.y, second.y),
    width: Math.abs(first.x - second.x),
    height: Math.abs(first.y - second.y)
  } satisfies Rectangle;
}

/**
 * The smallest rectangle that holds every point.
 *
 * @param points - The points, in any order.
 * @returns The bounding rectangle, or undefined for no points.
 */
export function boundsOf(points: Iterable<Point>) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }

  const isEmpty = left > right;
  if (isEmpty) {
    return undefined;
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  } satisfies Rectangle;
}

/**
 * Whether a point lies in a rectangle, its edges included.
 *
 * @param options - The rectangle and the point.
 * @returns True when the point is inside or on the edge.
 */
export function rectangleContains({ rectangle, point }: {
  rectangle: Rectangle;
  point: Point;
}) {
  const isInsideX = point.x >= rectangle.x && point.x <= rectangleRight(rectangle);
  const isInsideY = point.y >= rectangle.y && point.y <= rectangleBottom(rectangle);
  return isInsideX && isInsideY;
}

/**
 * A rectangle grown by the same amount on every side.
 *
 * @param options - The rectangle and the amount; negative shrinks it.
 * @returns The grown rectangle.
 */
export function inflateRectangle({ rectangle, amount }: {
  rectangle: Rectangle;
  amount: number;
}) {
  return {
    x: rectangle.x - amount,
    y: rectangle.y - amount,
    width: rectangle.width + amount * 2,
    height: rectangle.height + amount * 2
  } satisfies Rectangle;
}

/** What `lassoRegion` is given. */
export interface LassoRegionOptions {
  /** The points of the loop, in the order they were drawn. */
  readonly loop: Iterable<Point>;

  /** The area a selection may lie in, from its own top left. */
  readonly bounds: Size;

  /** A loop narrower or shorter than this is no circle; 10 by default. */
  readonly minimumStroke?: number;

  /** How far the loop's box grows; 16 by default. */
  readonly padding?: number;
}

/**
 * The rectangle a finished lasso loop selects: its bounding box, grown by
 * `padding` and kept inside `bounds`.
 *
 * @param options - The loop, the area and the limits.
 * @returns The selection, or undefined when the loop was too small.
 */
export function lassoRegion(
  { loop, bounds, minimumStroke = DEFAULT_MINIMUM_STROKE, padding = DEFAULT_LASSO_PADDING }: LassoRegionOptions
) {
  const drawn = boundsOf(loop);
  const isEmpty = drawn === undefined;
  if (isEmpty) {
    return undefined;
  }

  const isTooSmall = drawn.width < minimumStroke || drawn.height < minimumStroke;
  if (isTooSmall) {
    return undefined;
  }

  return overlapOf({
    first: inflateRectangle({
      rectangle: drawn,
      amount: padding
    }),
    second: wholeOf(bounds)
  });
}

/**
 * The rectangle a dragged rectangle selects, kept inside `bounds`.
 *
 * @param options - The two corners of the drag, the area, and the smallest side.
 * @returns The selection, or undefined when it is smaller than `minimumSize` on either side.
 */
export function dragRegion({ first, second, bounds, minimumSize = DEFAULT_MINIMUM_SIZE }: {
  first: Point;
  second: Point;
  bounds: Size;
  minimumSize?: number;
}) {
  const clipped = overlapOf({
    first: rectangleFromPoints({
      first,
      second
    }),
    second: wholeOf(bounds)
  });
  const isTooSmall = clipped === undefined || clipped.width < minimumSize || clipped.height < minimumSize;
  if (isTooSmall) {
    return undefined;
  }

  return clipped;
}

/**
 * The selection dragged so `grip` (where inside it the drag took hold) sits
 * under the pointer, its size unchanged and never past the edge of `bounds`.
 *
 * @param options - The selection, the grip offset, the pointer and the area.
 * @returns The moved selection.
 */
export function moveRegion({ selection, grip, pointer, bounds }: {
  selection: Rectangle;
  grip: Point;
  pointer: Point;
  bounds: Size;
}) {
  const farthestX = Math.max(0, bounds.width - selection.width);
  const farthestY = Math.max(0, bounds.height - selection.height);
  return {
    x: Math.min(Math.max(pointer.x - grip.x, 0), farthestX),
    y: Math.min(Math.max(pointer.y - grip.y, 0), farthestY),
    width: selection.width,
    height: selection.height
  } satisfies Rectangle;
}

/**
 * The corner of a selection within reach of a point.
 *
 * @param options - The selection, the point and how far a press reaches.
 * @returns The nearest corner, or undefined when none is within `reach`.
 */
export function nearestCorner({ selection, point, reach = DEFAULT_CORNER_REACH }: {
  selection: Rectangle;
  point: Point;
  reach?: number;
}) {
  let nearest: Point | undefined = undefined;
  let nearestDistance = Infinity;
  for (const corner of cornersOf(selection)) {
    const distance = distanceBetween({
      first: corner,
      second: point
    });
    const isNearer = distance < nearestDistance;
    if (isNearer) {
      nearest = corner;
      nearestDistance = distance;
    }
  }

  const isInReach = nearestDistance <= reach;
  if (!isInReach) {
    return undefined;
  }

  return nearest;
}

/**
 * Whether a corner resizes along the falling diagonal (top left and bottom
 * right) rather than the rising one, for the cursor to match.
 *
 * @param options - The selection and one of its corners.
 * @returns True for top left and bottom right.
 */
export function isFallingCorner({ selection, corner }: {
  selection: Rectangle;
  corner: Point;
}) {
  const isLeft = corner.x === selection.x;
  const isTop = corner.y === selection.y;
  return isLeft === isTop;
}

/**
 * Takes hold of a corner: the opposite corner becomes the anchor.
 *
 * @param options - The selection and the corner `nearestCorner` found.
 * @returns The grip `resizeRegion` follows.
 */
export function gripCorner({ selection, corner }: {
  selection: Rectangle;
  corner: Point;
}) {
  const anchor = {
    x: selection.x + rectangleRight(selection) - corner.x,
    y: selection.y + rectangleBottom(selection) - corner.y
  };
  return {
    anchor,
    direction: {
      x: Math.sign(corner.x - anchor.x),
      y: Math.sign(corner.y - anchor.y)
    }
  } satisfies CornerGrip;
}

function reachAlong({ anchor, pointer, direction, limit, minimumSize }: {
  anchor: number;
  pointer: number;
  direction: number;
  limit: number;
  minimumSize: number;
}) {
  const extent = Math.max(minimumSize, (pointer - anchor) * direction);
  return Math.min(Math.max(anchor + extent * direction, 0), limit);
}

function reachOrHold({ direction, held, ...reach }: {
  anchor: number;
  pointer: number;
  direction: number;
  held: number;
  limit: number;
  minimumSize: number;
}) {
  const isHeld = direction === 0;
  if (isHeld) {
    return reach.anchor + held;
  }

  return reachAlong({
    ...reach,
    direction
  });
}

/**
 * The selection with the grabbed corner or edge at the pointer, never smaller than
 * `minimumSize` and never past the edge of `bounds`.
 *
 * @param options - The grip, the pointer, the area and the smallest side.
 * @returns The resized selection.
 */
export function resizeRegion({ grip, pointer, bounds, minimumSize = DEFAULT_MINIMUM_SIZE }: {
  grip: CornerGrip;
  pointer: Point;
  bounds: Size;
  minimumSize?: number;
}) {
  const held = grip.held ?? {
    x: 0,
    y: 0
  };
  const left = reachOrHold({
    anchor: grip.anchor.x,
    pointer: pointer.x,
    direction: grip.direction.x,
    held: held.x,
    limit: bounds.width,
    minimumSize
  });
  const top = reachOrHold({
    anchor: grip.anchor.y,
    pointer: pointer.y,
    direction: grip.direction.y,
    held: held.y,
    limit: bounds.height,
    minimumSize
  });
  return rectangleFromPoints({
    first: grip.anchor,
    second: {
      x: left,
      y: top
    }
  });
}

/**
 * A selection in the pixels of a picture of the same area. A window spans a
 * monitor in device-independent pixels and its capture in physical ones, so
 * the ratio is the monitor's scale; rounding goes outward so no edge is lost.
 *
 * @param options - The selection, the size it was drawn in, and the picture's size.
 * @returns The selection in the picture's pixels, kept inside it, or undefined when it misses it.
 */
export function pixelRegion({ selection, drawnIn, picture }: {
  selection: Rectangle;
  drawnIn: Size;
  picture: Size;
}) {
  const scaleX = picture.width / drawnIn.width;
  const scaleY = picture.height / drawnIn.height;
  const left = Math.floor(selection.x * scaleX);
  const top = Math.floor(selection.y * scaleY);
  const right = Math.ceil(rectangleRight(selection) * scaleX);
  const bottom = Math.ceil(rectangleBottom(selection) * scaleY);
  return overlapOf({
    first: {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top
    },
    second: wholeOf(picture)
  });
}
