export type { CroppedViewOptions } from "./cropped-view.ts";
export { CroppedView } from "./cropped-view.ts";
export { DEFAULT_EDGE_REACH, gripEdge, isHorizontalEdge, nearestEdge, ResizeEdge } from "./edges.ts";
export type { KeyChord, SelectionShortcut } from "./keyboard.ts";
export { formatChord, NUDGE_LARGE_STEP, NUDGE_STEP, SELECTION_SHORTCUTS, selectorKeyEvent } from "./keyboard.ts";
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
export type { TextSelection, TextSelectorState } from "./text-selector.ts";
export { createTextSelector, reduceTextSelector, textSelection } from "./text-selector.ts";
export type { RecognizedLine, SelectableWord, WordRange } from "./text-words.ts";
export { DEFAULT_WORD_REACH, joinWords, selectableWords, wordAt, wordsBetween, wordsInRegion } from "./text-words.ts";
export {
  bracketPath,
  DEFAULT_BRACKET_ARM,
  DEFAULT_HANDLE_SIZE,
  DEFAULT_SCRIM_OPACITY,
  DEFAULT_SELECTED_SCRIM_OPACITY,
  DEFAULT_SELECTION_RADIUS,
  handlePoints,
  pointsText,
  scrimPath
} from "./overlay-geometry.ts";
