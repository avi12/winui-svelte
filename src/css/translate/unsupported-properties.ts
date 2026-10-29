const POSITIONED = `is read from a component's <style> block, which opts the window into its parser; a style attribute alone cannot. A <canvas> child places by canvas-left and canvas-top`;
const SIZED_BY_PARENT = "a child cannot size itself in its parent";
const FR_TRACKS = "give the parent grid-template-columns with fr tracks";
const ALIGNED_BY_CHILD = "WinUI aligns a child by its own";
const OPT_IN = "is read from a component's <style> block, which opts the window into its parser; a style attribute alone cannot";

const UNSUPPORTED_REASONS: ReadonlyMap<string, string> = new Map([
  ["position", `${POSITIONED} (position, top, left, right, bottom and inset)`],
  ["inset", POSITIONED],
  ["top", POSITIONED],
  ["left", POSITIONED],
  ["right", POSITIONED],
  ["bottom", POSITIONED],
  ["order", "WinUI lays children out in markup order; reorder the elements (an {#each} over a sorted list does it)"],
  ["grid-template-areas", "a grid has no named areas; place a child with grid-column and grid-row (or grid-area: row / column / row-end / column-end)"],
  ["grid-template", "write grid-template-columns and grid-template-rows"],
  ["grid-auto-flow", "a WinUI grid places a child by its Grid.Row and Grid.Column (default 0): there is no auto-placement; set grid-column and grid-row"],
  ["grid-auto-rows", "a WinUI grid has the rows grid-template-rows lists and no implicit ones"],
  ["grid-auto-columns", "a WinUI grid has the columns grid-template-columns lists and no implicit ones"],
  ["aspect-ratio", "WinUI has no aspect ratio on an element; set width and height (a Viewbox keeps a ratio)"],
  ["color-scheme", "the theme is the window's RequestedTheme; set it on the root element (a Style cannot change it)"],
  ["accent-color", "WinUI's accent color is the system's; override its resources instead (--accent-fill-color-default)"],
  ["float", "WinUI has no float; use a grid or a stack-panel"],
  ["flex", `${SIZED_BY_PARENT}: ${FR_TRACKS}`],
  ["flex-grow", `${SIZED_BY_PARENT}: ${FR_TRACKS}`],
  ["flex-shrink", `WinUI panels do not shrink their children; ${FR_TRACKS}`],
  ["flex-basis", `${SIZED_BY_PARENT}: use width or a grid parent`],
  ["flex-wrap", "WinUI has no wrapping stack (WrapPanel is in the Community Toolkit)"],
  ["align-items", `${ALIGNED_BY_CHILD} VerticalAlignment: set align-self on each child`],
  ["justify-items", `${ALIGNED_BY_CHILD} HorizontalAlignment: set justify-self on each child`],
  ["place-items", `${ALIGNED_BY_CHILD} alignment: set align-self and justify-self (place-self) on each child`],
  ["justify-content", `${ALIGNED_BY_CHILD} alignment: set justify-self on the child, or give a <grid> an auto track and a * track around it`],
  ["align-content", `${ALIGNED_BY_CHILD} alignment: set align-self on the child, or give a <grid> an auto row and a * row around it`],
  ["place-content", `${ALIGNED_BY_CHILD} alignment: set place-self on the child`],
  ["background-image", `a gradient ${OPT_IN}`],
  ["box-shadow", `a shadow ${OPT_IN}`],
  ["filter", "WinUI has no filter: blur, grayscale, brightness and drop-shadow are Composition effects that need Win2D and ElementCompositionPreview, which the bindings lack; use backdrop-filter: blur() or an acrylic or Mica backdrop"],
  ["backdrop-filter", `blur() ${OPT_IN}`],
  ["transform", `a transform ${OPT_IN}`],
  ["transition", `a transition ${OPT_IN}`],
  ["animation", `an animation ${OPT_IN}`],
  ["content", "WinUI has no generated content"],
  ["list-style", "WinUI has no lists to mark"],
  ["text-transform", "WinUI draws a TextBlock's Text as written, so change the text"],
  ["text-indent", "WinUI has no text indent"],
  ["aspect-ratio", `a ratio ${OPT_IN}`],
  ["clip-path", `a clip ${OPT_IN}`],
  ["mix-blend-mode", "WinUI has no blend modes: a Composition effect brush needs Win2D, which the bindings lack"],
  ["mask", "WinUI has no opacity mask on an element: a Composition mask brush needs ElementCompositionPreview, which the bindings lack"],
  ["mask-image", "WinUI has no opacity mask on an element: a Composition mask brush needs ElementCompositionPreview, which the bindings lack"]
]);

/** Why a property no group handles has no WinUI meaning, for the ones an author is likely to write. */
export function unsupportedReason(property: string) {
  return UNSUPPORTED_REASONS.get(property) ?? "WinUI has no property that corresponds to it";
}

const UNSUPPORTED_AT_RULES: ReadonlyMap<string, string> = new Map([
  ["scope", "it is written out against the component's markup by the component build, not by a bare stylesheet"],
  ["supports", "WinUI supports exactly what this translator accepts; write the rules without the condition"],
  ["keyframes", "use transition on opacity, translate, scale or rotate"],
  ["import", "import the component or its stylesheet from the script"]
]);

/** What to write instead of an at-rule no group handles (for the likely ones); empty for the others. */
export function unsupportedAtRuleReason(name: string) {
  return UNSUPPORTED_AT_RULES.get(name) ?? "";
}
