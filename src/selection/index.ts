export type { CroppedViewOptions } from "./cropped-view.ts";
export { CroppedView } from "./cropped-view.ts";
export type { CornerGrip, LassoRegionOptions, Point } from "./geometry.ts";
export {
  boundsOf,
  DEFAULT_CORNER_REACH,
  DEFAULT_LASSO_PADDING,
  DEFAULT_MINIMUM_SIZE,
  DEFAULT_MINIMUM_STROKE,
  distanceBetween,
  dragRegion,
  gripCorner,
  inflateRectangle,
  isFallingCorner,
  lassoRegion,
  moveRegion,
  nearestCorner,
  pixelRegion,
  rectangleContains,
  rectangleFromPoints,
  resizeRegion
} from "./geometry.ts";
export type {
  SelectionResult,
  SelectorEvent,
  SelectorLimits,
  SelectorOptions,
  SelectorState
} from "./selector.ts";
export {
  createSelector,
  DEFAULT_MINIMUM_STEP,
  hoverCursor,
  reduceSelector,
  SelectionCursor,
  SelectionPhase,
  selectionResult,
  SelectionShape,
  SelectorEventKind,
  visibleRegion
} from "./selector.ts";
export type { Rectangle, Size } from "#src/capture/region.js";
