import { isFrameworkElement } from "./element-guard.ts";
import { elementVisualOf } from "./element-visual.ts";
import type { VisualHost } from "#src/css/translate/visual-effect-properties.js";

function elementOf(control: object) {
  if (!isFrameworkElement(control)) {
    throw new TypeError("filter, mix-blend-mode, mask and clip-path apply to a FrameworkElement");
  }

  return control;
}

/**
 * What the CSS runtime draws effects and clips with: Composition visuals and
 * Win2D effects, through `elementVisualOf`.
 */
export const nativeVisualHost = {
  setEffects({ control, effects }) {
    elementVisualOf(elementOf(control)).setEffects(effects);
  },
  setClip({ control, shape }) {
    elementVisualOf(elementOf(control)).setClip(shape);
  }
} satisfies VisualHost;
