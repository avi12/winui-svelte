import type { ResizeEdge } from "./edges.ts";
import { DEFAULT_EDGE_REACH, gripEdge, isHorizontalEdge, nearestEdge } from "./edges.ts";
import type { CornerGrip, Point } from "./geometry.ts";
import {
  DEFAULT_CORNER_REACH,
  DEFAULT_LASSO_PADDING,
  DEFAULT_MINIMUM_SIZE,
  DEFAULT_MINIMUM_STROKE,
  distanceBetween,
  dragRegion,
  gripCorner,
  isFallingCorner,
  lassoRegion,
  moveRegion,
  nearestCorner,
  rectangleContains,
  rectangleFromPoints,
  resizeRegion
} from "./geometry.ts";
import type { Rectangle, Size } from "#src/capture/region.js";

/** Pointer moves shorter than this add no point to a loop, so a slow hand does not pile up thousands. */
export const DEFAULT_MINIMUM_STEP = 1.5;

/** How a press-and-drag makes a selection. */
export const SelectionShape = {
  /** Draw a loop; the selection is its padded bounding box. */
  lasso: "lasso",
  /** Drag out a rectangle from one corner to the opposite one. */
  rectangle: "rectangle"
} as const;
/** A way of making a selection, one of the `SelectionShape` values. */
export type SelectionShape = typeof SelectionShape[keyof typeof SelectionShape];

/** What the pointer is doing to the selection. */
export const SelectionPhase = {
  idle: "idle",
  draw: "draw",
  resize: "resize",
  move: "move"
} as const;
/** What the pointer is doing, one of the `SelectionPhase` values. */
export type SelectionPhase = typeof SelectionPhase[keyof typeof SelectionPhase];

/** The pointer cursors, as CSS names, that fit what a press would do at a point. */
export const SelectionCursor = {
  draw: "crosshair",
  move: "move",
  resizeFalling: "nwse-resize",
  resizeRising: "nesw-resize",
  resizeVertical: "ns-resize",
  resizeHorizontal: "ew-resize"
} as const;
/** A CSS cursor name, one of the `SelectionCursor` values. */
export type SelectionCursor = typeof SelectionCursor[keyof typeof SelectionCursor];

/** The kinds of event `reduceSelector` takes. */
export const SelectorEventKind = {
  pointerDown: "pointerDown",
  pointerMove: "pointerMove",
  pointerUp: "pointerUp",
  nudge: "nudge",
  resizeBy: "resizeBy",
  clear: "clear"
} as const;

/** What happens to the selector. */
export type SelectorEvent =
  | {
    readonly kind: typeof SelectorEventKind.pointerDown;
    readonly point: Point;
  }
  | {
    readonly kind: typeof SelectorEventKind.pointerMove;
    readonly point: Point;
  }
  /** The press ended, or the pointer capture was lost: either way the gesture is over. */
  | { readonly kind: typeof SelectorEventKind.pointerUp }
  /** Moves the selection by `delta`, kept inside the area; ignored with no selection or a gesture under way. */
  | {
    readonly kind: typeof SelectorEventKind.nudge;
    readonly delta: Point;
  }
  /** Moves the bottom right corner by `delta`, within the minimum size and the area; ignored like a nudge. */
  | {
    readonly kind: typeof SelectorEventKind.resizeBy;
    readonly delta: Point;
  }
  /** Drops the selection, for a new start. */
  | { readonly kind: typeof SelectorEventKind.clear };

/** What `createSelector` is given. */
export interface SelectorOptions {
  /** The area a selection may lie in, from its own top left: the window's size in device-independent pixels. */
  readonly bounds: Size;

  /** `lasso` by default. */
  readonly shape?: SelectionShape;

  /** A pointer move shorter than this adds no point to a loop; `DEFAULT_MINIMUM_STEP` by default. */
  readonly minimumStep?: number;

  /** A lasso loop narrower or shorter than this is no circle; 10 by default. */
  readonly minimumStroke?: number;

  /** How far a lasso's box grows past its loop; 16 by default. */
  readonly padding?: number;

  /** The smallest side a drawn rectangle or a resized selection may have; 20 by default. */
  readonly minimumSize?: number;

  /** How close to a corner a press takes hold of it to resize; 28 by default. */
  readonly cornerReach?: number;

  /** How close to an edge, between the corners, a press takes hold of it to resize; `DEFAULT_EDGE_REACH` by default. */
  readonly edgeReach?: number;
}

/** The numbers a selector runs with, every option filled in. */
export interface SelectorLimits {
  readonly shape: SelectionShape;
  readonly minimumStep: number;
  readonly minimumStroke: number;
  readonly padding: number;
  readonly minimumSize: number;
  readonly cornerReach: number;
  readonly edgeReach: number;
}

/** Everything a selector knows. Treat it as read-only: `reduceSelector` makes the next one. */
export interface SelectorState {
  readonly bounds: Size;
  readonly limits: SelectorLimits;
  readonly phase: SelectionPhase;

  /** The points of the gesture being drawn: the loop of a lasso, or the two corners of a rectangle. */
  readonly stroke: readonly Point[];

  /** The finished selection, until the next press outside it clears it. */
  readonly selection: Rectangle | undefined;

  /** The loop that made `selection`, for a mask in its shape; empty for a rectangle, a move or a resize. */
  readonly outline: readonly Point[];
  readonly resizeGrip: CornerGrip | undefined;

  /** Where inside the selection a move took hold, so it does not jump to the pointer. */
  readonly moveGrip: Point | undefined;
}

/** What a finished selection comes to. */
export interface SelectionResult {
  /** The selection, in the unit of `bounds`. */
  readonly region: Rectangle;
  readonly shape: SelectionShape;

  /** The lasso loop that made it (`region` stays the box); empty for a rectangle or an edited selection. */
  readonly outline: readonly Point[];
}

/**
 * The start of a selector: nothing selected, nothing happening.
 *
 * @param options - The area and the limits.
 * @returns The state to feed `reduceSelector`.
 */
export function createSelector(options: SelectorOptions) {
  return {
    bounds: options.bounds,
    limits: {
      shape: options.shape ?? SelectionShape.lasso,
      minimumStep: options.minimumStep ?? DEFAULT_MINIMUM_STEP,
      minimumStroke: options.minimumStroke ?? DEFAULT_MINIMUM_STROKE,
      padding: options.padding ?? DEFAULT_LASSO_PADDING,
      minimumSize: options.minimumSize ?? DEFAULT_MINIMUM_SIZE,
      cornerReach: options.cornerReach ?? DEFAULT_CORNER_REACH,
      edgeReach: options.edgeReach ?? DEFAULT_EDGE_REACH
    },
    phase: SelectionPhase.idle,
    stroke: [],
    selection: undefined,
    outline: [],
    resizeGrip: undefined,
    moveGrip: undefined
  } satisfies SelectorState;
}

function grabSelection({ state, point }: {
  state: SelectorState;
  point: Point;
}) {
  const { selection } = state;
  const isUnselected = selection === undefined;
  if (isUnselected) {
    return undefined;
  }

  const corner = nearestCorner({
    selection,
    point,
    reach: state.limits.cornerReach
  });
  const isOnCorner = corner !== undefined;
  if (isOnCorner) {
    return {
      ...state,
      phase: SelectionPhase.resize,
      resizeGrip: gripCorner({
        selection,
        corner
      })
    } satisfies SelectorState;
  }

  const edge = nearestEdge({
    selection,
    point,
    reach: state.limits.edgeReach
  });
  const isOnEdge = edge !== undefined;
  if (isOnEdge) {
    return {
      ...state,
      phase: SelectionPhase.resize,
      resizeGrip: gripEdge({
        selection,
        edge
      })
    } satisfies SelectorState;
  }

  const isOnSelection = rectangleContains({
    rectangle: selection,
    point
  });
  if (isOnSelection) {
    return {
      ...state,
      phase: SelectionPhase.move,
      moveGrip: {
        x: point.x - selection.x,
        y: point.y - selection.y
      }
    } satisfies SelectorState;
  }

  return undefined;
}

function pressDown({ state, point }: {
  state: SelectorState;
  point: Point;
}) {
  const grabbed = grabSelection({
    state,
    point
  });
  const isGrabbed = grabbed !== undefined;
  if (isGrabbed) {
    return grabbed;
  }

  return {
    ...state,
    phase: SelectionPhase.draw,
    selection: undefined,
    outline: [],
    stroke: [point]
  } satisfies SelectorState;
}

function extendStroke({ state, point }: {
  state: SelectorState;
  point: Point;
}) {
  const isRectangle = state.limits.shape === SelectionShape.rectangle;
  const [origin] = state.stroke;
  const isRectangleDrag = isRectangle && origin !== undefined;
  if (isRectangleDrag) {
    return {
      ...state,
      stroke: [origin, point]
    } satisfies SelectorState;
  }

  const last = state.stroke.at(-1);
  const isTooClose = last !== undefined && distanceBetween({
    first: point,
    second: last
  }) < state.limits.minimumStep;
  if (isTooClose) {
    return state;
  }

  return {
    ...state,
    stroke: [...state.stroke, point]
  } satisfies SelectorState;
}

function pointerMoved({ state, point }: {
  state: SelectorState;
  point: Point;
}) {
  const isDrawing = state.phase === SelectionPhase.draw;
  if (isDrawing) {
    return extendStroke({
      state,
      point
    });
  }

  const isResizing = state.phase === SelectionPhase.resize && state.resizeGrip !== undefined;
  if (isResizing) {
    return {
      ...state,
      selection: resizeRegion({
        grip: state.resizeGrip,
        pointer: point,
        bounds: state.bounds,
        minimumSize: state.limits.minimumSize
      })
    } satisfies SelectorState;
  }

  const isMoving = state.phase === SelectionPhase.move && state.selection !== undefined &&
    state.moveGrip !== undefined;
  if (isMoving) {
    return {
      ...state,
      selection: moveRegion({
        selection: state.selection,
        grip: state.moveGrip,
        pointer: point,
        bounds: state.bounds
      })
    } satisfies SelectorState;
  }

  return state;
}

function drawnRegion(state: SelectorState) {
  const isRectangle = state.limits.shape === SelectionShape.rectangle;
  const [first] = state.stroke;
  const second = state.stroke.at(-1);
  const isRectangleDrag = isRectangle && first !== undefined && second !== undefined;
  if (isRectangleDrag) {
    return dragRegion({
      first,
      second,
      bounds: state.bounds,
      minimumSize: state.limits.minimumSize
    });
  }

  return lassoRegion({
    loop: state.stroke,
    bounds: state.bounds,
    minimumStroke: state.limits.minimumStroke,
    padding: state.limits.padding
  });
}

function pressEnded(state: SelectorState) {
  const idle = {
    ...state,
    phase: SelectionPhase.idle,
    resizeGrip: undefined,
    moveGrip: undefined
  } satisfies SelectorState;
  const isEndingDraw = state.phase === SelectionPhase.draw;
  if (!isEndingDraw) {
    return idle;
  }

  const drawn = drawnRegion(state);
  const isTooSmall = drawn === undefined;
  if (isTooSmall) {
    return idle;
  }

  const isLasso = state.limits.shape === SelectionShape.lasso;
  return {
    ...idle,
    selection: drawn,
    outline: isLasso ? state.stroke : []
  } satisfies SelectorState;
}

/**
 * What a pointer event does to the selection, as a pure step. A press on a
 * corner of the selection resizes it, a press inside it moves it, a press
 * anywhere else starts a new one; a stroke too small to be a selection is
 * dropped and the previous selection is gone as soon as the new press began.
 *
 * @param options - The state and the event.
 * @returns The next state; the same object when nothing changed.
 */
export function reduceSelector({ state, event }: {
  state: SelectorState;
  event: SelectorEvent;
}) {
  switch (event.kind) {
    case SelectorEventKind.pointerDown:
      return pressDown({
        state,
        point: event.point
      });
    case SelectorEventKind.pointerMove:
      return pointerMoved({
        state,
        point: event.point
      });
    case SelectorEventKind.pointerUp:
      return pressEnded(state);
    case SelectorEventKind.nudge:
      return nudged({
        state,
        delta: event.delta
      });
    case SelectorEventKind.resizeBy:
      return resizedBy({
        state,
        delta: event.delta
      });
    case SelectorEventKind.clear:
      return createSelector({
        bounds: state.bounds,
        ...state.limits
      });
  }
}

function nudged({ state, delta }: {
  state: SelectorState;
  delta: Point;
}) {
  const { selection } = state;
  const isIdle = state.phase === SelectionPhase.idle && selection !== undefined;
  if (!isIdle) {
    return state;
  }

  return {
    ...state,
    selection: moveRegion({
      selection,
      grip: {
        x: 0,
        y: 0
      },
      pointer: {
        x: selection.x + delta.x,
        y: selection.y + delta.y
      },
      bounds: state.bounds
    })
  } satisfies SelectorState;
}

function resizedBy({ state, delta }: {
  state: SelectorState;
  delta: Point;
}) {
  const { selection } = state;
  const isIdle = state.phase === SelectionPhase.idle && selection !== undefined;
  if (!isIdle) {
    return state;
  }

  return {
    ...state,
    selection: resizeRegion({
      grip: gripCorner({
        selection,
        corner: {
          x: selection.x + selection.width,
          y: selection.y + selection.height
        }
      }),
      pointer: {
        x: selection.x + selection.width + delta.x,
        y: selection.y + selection.height + delta.y
      },
      bounds: state.bounds,
      minimumSize: state.limits.minimumSize
    })
  } satisfies SelectorState;
}

/**
 * The rectangle to draw right now: the live box of a rectangle being dragged,
 * otherwise the selection (a lasso shows its loop, `state.stroke`, meanwhile).
 *
 * @param state - The selector state.
 * @returns The rectangle, or undefined when there is none.
 */
export function visibleRegion(state: SelectorState) {
  const isDraggingRectangle = state.phase === SelectionPhase.draw &&
    state.limits.shape === SelectionShape.rectangle;
  const [first, second] = state.stroke;
  const hasCorners = first !== undefined && second !== undefined;
  const isShowingBox = isDraggingRectangle && hasCorners;
  if (isShowingBox) {
    return rectangleFromPoints({
      first,
      second
    });
  }

  return state.selection;
}

/**
 * What the selector has to offer once the gesture is done.
 *
 * @param state - The selector state.
 * @returns The result, or undefined while nothing is selected.
 */
export function selectionResult(state: SelectorState) {
  const { selection } = state;
  const isUnselected = selection === undefined;
  if (isUnselected) {
    return undefined;
  }

  return {
    region: selection,
    shape: state.limits.shape,
    outline: state.outline
  } satisfies SelectionResult;
}

function edgeCursor(edge: ResizeEdge) {
  const isHorizontal = isHorizontalEdge(edge);
  return isHorizontal ? SelectionCursor.resizeVertical : SelectionCursor.resizeHorizontal;
}

/**
 * The cursor that fits a press at a point: a diagonal resize arrow over a
 * corner, a vertical or horizontal one over an edge, the four-way move arrow
 * over the rest of the selection, the drawing
 * cross everywhere else.
 *
 * @param options - The state and the pointer's point.
 * @returns A CSS cursor name.
 */
export function hoverCursor({ state, point }: {
  state: SelectorState;
  point: Point;
}) {
  const { selection } = state;
  const isUnselected = selection === undefined;
  if (isUnselected) {
    return SelectionCursor.draw;
  }

  const corner = nearestCorner({
    selection,
    point,
    reach: state.limits.cornerReach
  });
  const isAwayFromCorners = corner === undefined;
  if (isAwayFromCorners) {
    const edge = nearestEdge({
      selection,
      point,
      reach: state.limits.edgeReach
    });
    const isOnEdge = edge !== undefined;
    if (isOnEdge) {
      return edgeCursor(edge);
    }

    const isInside = rectangleContains({
      rectangle: selection,
      point
    });
    return isInside ? SelectionCursor.move : SelectionCursor.draw;
  }

  const isFalling = isFallingCorner({
    selection,
    corner
  });
  return isFalling ? SelectionCursor.resizeFalling : SelectionCursor.resizeRising;
}
