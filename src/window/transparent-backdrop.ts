import { write } from "#src/renderer/host/reflect.js";
import type { Window } from "#src/winui.js";
import { ICompositionSupportsSystemBackdrop } from "#src/winui.js";

// The Windows App SDK's own Microsoft.UI.Xaml.Media.TransparentTintBackdrop is
// not in the metadata of any release this package restores (2.2 and 2.3 have
// DesktopAcrylicBackdrop, MicaBackdrop and the abstract SystemBackdrop only),
// so it cannot be generated. What it does is what a window offers through
// ICompositionSupportsSystemBackdrop: a composition brush placed behind the
// content. A color brush with alpha 0 there makes the window show the desktop
// through every pixel the content leaves clear, with per-pixel alpha.

const CLEAR = {
  a: 0,
  r: 0,
  g: 0,
  b: 0
};

/**
 * Puts a fully transparent system backdrop behind `window`'s content: the
 * desktop shows through wherever the content paints nothing, and a partly
 * transparent pixel blends with it. The window must have no XAML backdrop of
 * its own (`applyBackdrop` takes it away first).
 *
 * @returns What takes the backdrop away again.
 */
export function attachTransparentBackdrop(window: Window) {
  const target = window.as(ICompositionSupportsSystemBackdrop);
  target.systemBackdrop = window.compositor.createColorBrush(CLEAR);
  return () => {
    // The binding types the property as non-null, but null is how the target
    // lets a backdrop go.
    write(target, "systemBackdrop", null);
  };
}
