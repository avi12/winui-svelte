import type { CornerGrip, Point } from "./geometry.ts";
import type { Rectangle } from "#src/capture/region.js";

/** The distance a press may be from an edge and still take hold of it. */
export const DEFAULT_EDGE_REACH = 22;

/** The four edges of a selection that resize it along one axis. */
export const ResizeEdge = {
  top: "top",
  right: "right",
  bottom: "bottom",
  left: "left"
} as const;
/** An edge of a selection, one of the `ResizeEdge` values. */
export type ResizeEdge = typeof ResizeEdge[keyof typeof ResizeEdge];

const EDGES = Object.values(ResizeEdge);

function distanceToEdge({ selection, point, edge }: {
  selection: Rectangle;
  point: Point;
  edge: ResizeEdge;
}) {
  const right = selection.x + selection.width;
  const bottom = selection.y + selection.height;
  const isAlongX = point.x >= selection.x && point.x <= right;
  const isAlongY = point.y >= selection.y && point.y <= bottom;
  switch (edge) {
    case ResizeEdge.top:
      return isAlongX ? Math.abs(point.y - selection.y) : Infinity;
    case ResizeEdge.bottom:
      return isAlongX ? Math.abs(point.y - bottom) : Infinity;
    case ResizeEdge.left:
      return isAlongY ? Math.abs(point.x - selection.x) : Infinity;
    case ResizeEdge.right:
      return isAlongY ? Math.abs(point.x - right) : Infinity;
  }
}

/**
 * The edge of a selection within reach of a point, between its corners.
 *
 * @param options - The selection, the point and how far a press reaches.
 * @returns The nearest edge, or undefined when none is within `reach`.
 */
export function nearestEdge({ selection, point, reach = DEFAULT_EDGE_REACH }: {
  selection: Rectangle;
  point: Point;
  reach?: number;
}) {
  let nearest: ResizeEdge | undefined = undefined;
  let nearestDistance = Infinity;
  for (const edge of EDGES) {
    const distance = distanceToEdge({
      selection,
      point,
      edge
    });
    const isNearer = distance < nearestDistance;
    if (isNearer) {
      nearest = edge;
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
 * Whether an edge is a horizontal line (top and bottom), which resizes
 * vertically, for the cursor to match.
 *
 * @param edge - One of the selection's edges.
 * @returns True for top and bottom.
 */
export function isHorizontalEdge(edge: ResizeEdge) {
  return edge === ResizeEdge.top || edge === ResizeEdge.bottom;
}

/**
 * Takes hold of an edge: the opposite edge becomes the anchor and the
 * selection keeps its length along the edge.
 *
 * @param options - The selection and the edge `nearestEdge` found.
 * @returns The grip `resizeRegion` follows.
 */
export function gripEdge({ selection, edge }: {
  selection: Rectangle;
  edge: ResizeEdge;
}) {
  const right = selection.x + selection.width;
  const bottom = selection.y + selection.height;
  const origin = {
    x: selection.x,
    y: selection.y
  };
  const held = {
    x: selection.width,
    y: selection.height
  };
  switch (edge) {
    case ResizeEdge.top:
      return {
        anchor: {
          x: selection.x,
          y: bottom
        },
        direction: {
          x: 0,
          y: -1
        },
        held: {
          x: held.x,
          y: 0
        }
      } satisfies CornerGrip;
    case ResizeEdge.bottom:
      return {
        anchor: origin,
        direction: {
          x: 0,
          y: 1
        },
        held: {
          x: held.x,
          y: 0
        }
      } satisfies CornerGrip;
    case ResizeEdge.left:
      return {
        anchor: {
          x: right,
          y: selection.y
        },
        direction: {
          x: -1,
          y: 0
        },
        held: {
          x: 0,
          y: held.y
        }
      } satisfies CornerGrip;
    case ResizeEdge.right:
      return {
        anchor: origin,
        direction: {
          x: 1,
          y: 0
        },
        held: {
          x: 0,
          y: held.y
        }
      } satisfies CornerGrip;
  }
}
