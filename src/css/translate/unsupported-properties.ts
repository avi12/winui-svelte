const POSITIONED = `is read from a component's <style> block, which opts the window into its parser; a style attribute alone cannot. A <canvas> child places by canvas-left and canvas-top`;
const LOWERED = "is lowered by the component build into the children of a <stack-panel> or <grid> written in the same component; a rule inside @media, a container that is a component and a stylesheet outside a component are not reached (write align-self, justify-self and grid-column on the elements instead)";
const OPT_IN = "is read from a component's <style> block, which opts the window into its parser; a style attribute alone cannot";

const UNSUPPORTED_REASONS: ReadonlyMap<string, string> = new Map([
  ["position", `${POSITIONED} (position, top, left, right, bottom and inset)`],
  ["inset", POSITIONED],
  ["top", POSITIONED],
  ["left", POSITIONED],
  ["right", POSITIONED],
  ["bottom", POSITIONED],
  ["order", LOWERED],
  ["flex", LOWERED],
  ["flex-grow", LOWERED],
  ["flex-shrink", LOWERED],
  ["flex-basis", LOWERED],
  ["align-items", LOWERED],
  ["justify-items", LOWERED],
  ["place-items", LOWERED],
  ["justify-content", LOWERED],
  ["align-content", LOWERED],
  ["place-content", LOWERED],
  ["grid-template-areas", "a grid has no named areas; place a child with grid-column and grid-row (or grid-area: row / column / row-end / column-end)"],
  ["grid-template", "write grid-template-columns and grid-template-rows"],
  ["grid-auto-flow", "a WinUI grid places a child by its Grid.Row and Grid.Column (default 0): there is no auto-placement; set grid-column and grid-row"],
  ["grid-auto-rows", "a WinUI grid has the rows grid-template-rows lists and no implicit ones"],
  ["grid-auto-columns", "a WinUI grid has the columns grid-template-columns lists and no implicit ones"],
  ["aspect-ratio", "WinUI has no aspect ratio on an element; set width and height (a Viewbox keeps a ratio)"],
  ["forced-color-adjust", "WinUI's high contrast theme recolors controls through theme resources, which an element cannot opt out of; set its colors in an @media (forced-colors: active) rule with a system color (Canvas, CanvasText, ButtonFace...) or var(--system-color-...-color)"],
  ["accent-color", "WinUI's accent color is the system's; override its resources instead (--accent-fill-color-default)"],
  ["float", "WinUI has no float; use a grid or a stack-panel"],
  ["flex-wrap", "WinUI has no wrapping stack (WrapPanel is in the Community Toolkit); wrap chips of different widths in a <rich-text-block> with a <paragraph> of <inline-ui-container>s, or equal cells in a <variable-sized-wrap-grid>"],
  ["background-image", `a gradient ${OPT_IN}`],
  ["box-shadow", `a shadow ${OPT_IN}`],
  ["filter", `a filter ${OPT_IN}`],
  ["backdrop-filter", `a backdrop filter ${OPT_IN}`],
  ["transform", `a transform ${OPT_IN}`],
  ["transition", `a transition ${OPT_IN}`],
  ["animation", `an animation ${OPT_IN}`],
  ["content", "WinUI has no generated content"],
  ["list-style", "WinUI has no lists to mark"],
  ["text-indent", "WinUI has no text indent"],
  ["caret-color", "the caret follows Foreground"],
  ["text-box-trim", "WinUI cannot trim the line box"],
  ["aspect-ratio", `a ratio ${OPT_IN}`],
  ["clip-path", `a clip ${OPT_IN}`],
  ["mix-blend-mode", `a blend mode ${OPT_IN}`],
  ["mask", `a mask ${OPT_IN}`],
  ["mask-image", `a mask ${OPT_IN}`]
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

/** Every property with a written reason it has no WinUI meaning, with that reason. */
export function unsupportedReasonEntries() {
  return [...UNSUPPORTED_REASONS];
}
