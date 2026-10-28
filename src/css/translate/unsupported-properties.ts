const UNSUPPORTED_REASONS: ReadonlyMap<string, string> = new Map([
  ["position", "WinUI lays children out with panels; a <canvas> places by canvas-left and canvas-top"],
  ["top", "WinUI lays children out with panels; a <canvas> places by canvas-top"],
  ["left", "WinUI lays children out with panels; a <canvas> places by canvas-left"],
  ["right", "WinUI lays children out with panels"],
  ["bottom", "WinUI lays children out with panels"],
  ["float", "WinUI has no float; use a grid or a stack-panel"],
  ["flex", "a child cannot size itself in its parent: give the parent grid-template-columns with fr tracks"],
  ["flex-grow", "a child cannot size itself in its parent: give the parent grid-template-columns with fr tracks"],
  ["flex-shrink", "WinUI panels do not shrink their children; give the parent grid-template-columns with fr tracks"],
  ["flex-basis", "a child cannot size itself in its parent: use width or a grid parent"],
  ["flex-wrap", "WinUI has no wrapping stack (WrapPanel is in the Community Toolkit)"],
  ["align-items", "WinUI aligns a child by its own VerticalAlignment: set align-self on the child"],
  ["justify-items", "WinUI aligns a child by its own HorizontalAlignment: set justify-self on the child"],
  ["place-items", "WinUI aligns a child by its own alignment: set align-self and justify-self on the child"],
  ["justify-content", "WinUI aligns a child by its own alignment: set justify-self on the child"],
  ["align-content", "WinUI aligns a child by its own alignment: set align-self on the child"],
  ["background-image", "a gradient is read from a component's <style> block, which opts the window into its parser; a style attribute alone cannot"],
  ["box-shadow", "a WinUI shadow is a ThemeShadow set on the element, not a Style value"],
  ["filter", "WinUI has no filters; use an acrylic or Mica backdrop"],
  ["backdrop-filter", "use an acrylic brush or a Mica backdrop"],
  ["transform", "use translate, scale and rotate, which WinUI animates"],
  ["animation", "use transition on opacity, translate, scale or rotate"],
  ["content", "WinUI has no generated content"],
  ["outline", "WinUI draws its own focus visuals"],
  ["list-style", "WinUI has no lists to mark"],
  ["text-transform", "WinUI has no text-transform; change the text"],
  ["text-indent", "WinUI has no text indent"],
  ["word-break", "WinUI wraps on words; use text-wrap"],
  ["user-select", "set IsTextSelectionEnabled on the text block"]
]);

/** Why a property no group handles has no WinUI meaning, for the ones an author is likely to write. */
export function unsupportedReason(property: string) {
  return UNSUPPORTED_REASONS.get(property) ?? "WinUI has no property that corresponds to it";
}
