import { isFrameworkElement } from "./element-guard.ts";
import { elementVisualOf } from "./element-visual.ts";
import { pathControlLength } from "./path-length.ts";
import { provideElementBlur } from "#src/renderer/host/element-animation.js";
import { provideShapeLength } from "#src/renderer/host/shape-length.js";

/**
 * Lets Svelte's `blur` transition blur the element for real (a Gaussian blur
 * of its Composition visual, animated by its radius) and `draw` measure a
 * `<path>` (with Win2D), as the CSS `filter: blur()` does. The Vite plugin calls
 * it from a component that imports `blur` or `draw` from `svelte/transition`;
 * it is idempotent, and an app that does neither never bundles Win2D for them.
 */
export function enableElementEffects() {
  provideElementBlur(({ control, radius }) => {
    const isElement = isFrameworkElement(control);
    if (isElement) {
      elementVisualOf(control).setBlur(radius);
    }
  });
  provideShapeLength(pathControlLength);
}
