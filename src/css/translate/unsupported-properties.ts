const PANELS = "WinUI lays children out with panels";
const SIZED_BY_PARENT = "a child cannot size itself in its parent";
const FR_TRACKS = "give the parent grid-template-columns with fr tracks";
const ALIGNED_BY_CHILD = "WinUI aligns a child by its own";
const OPT_IN = "is read from a component's <style> block, which opts the window into its parser; a style attribute alone cannot";

const UNSUPPORTED_REASONS: ReadonlyMap<string, string> = new Map([
  ["position", `${PANELS}; a <canvas> places by canvas-left and canvas-top`],
  ["top", `${PANELS}; a <canvas> places by canvas-top`],
  ["left", `${PANELS}; a <canvas> places by canvas-left`],
  ["right", PANELS],
  ["bottom", PANELS],
  ["float", "WinUI has no float; use a grid or a stack-panel"],
  ["flex", `${SIZED_BY_PARENT}: ${FR_TRACKS}`],
  ["flex-grow", `${SIZED_BY_PARENT}: ${FR_TRACKS}`],
  ["flex-shrink", `WinUI panels do not shrink their children; ${FR_TRACKS}`],
  ["flex-basis", `${SIZED_BY_PARENT}: use width or a grid parent`],
  ["flex-wrap", "WinUI has no wrapping stack (WrapPanel is in the Community Toolkit)"],
  ["align-items", `${ALIGNED_BY_CHILD} VerticalAlignment: set align-self on the child`],
  ["justify-items", `${ALIGNED_BY_CHILD} HorizontalAlignment: set justify-self on the child`],
  ["place-items", `${ALIGNED_BY_CHILD} alignment: set align-self and justify-self on the child`],
  ["justify-content", `${ALIGNED_BY_CHILD} alignment: set justify-self on the child`],
  ["align-content", `${ALIGNED_BY_CHILD} alignment: set align-self on the child`],
  ["background-image", `a gradient ${OPT_IN}`],
  ["box-shadow", `a shadow ${OPT_IN}`],
  ["filter", "WinUI has no filters; use an acrylic or Mica backdrop"],
  ["backdrop-filter", `blur() ${OPT_IN}`],
  ["transform", `a transform ${OPT_IN}`],
  ["transition", `a transition ${OPT_IN}`],
  ["animation", `an animation ${OPT_IN}`],
  ["content", "WinUI has no generated content"],
  ["list-style", "WinUI has no lists to mark"],
  ["text-transform", "WinUI has no text-transform; change the text"],
  ["text-indent", "WinUI has no text indent"],
  ["aspect-ratio", "WinUI has no aspect ratio; give the width and the height"]
]);

/** Why a property no group handles has no WinUI meaning, for the ones an author is likely to write. */
export function unsupportedReason(property: string) {
  return UNSUPPORTED_REASONS.get(property) ?? "WinUI has no property that corresponds to it";
}
