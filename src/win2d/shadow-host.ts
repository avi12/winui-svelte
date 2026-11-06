import { isFrameworkElement } from "./element-guard.ts";
import { elementShadowOf } from "./element-shadow.ts";
import { joinShadowGroup } from "./shadow-receivers.ts";
import type { ShadowHost } from "#src/css/translate/shadow-properties.js";

function elementOf(control: object) {
  if (!isFrameworkElement(control)) {
    throw new TypeError("a Composition shadow and shadow receivers apply to a FrameworkElement");
  }

  return control;
}

/** What the CSS runtime draws shadows with: Composition DropShadows, and ThemeShadow receivers by group. */
export const nativeShadowHost = {
  setLayers({ control, layers }) {
    elementShadowOf(elementOf(control)).setLayers(layers);
  },
  join({ control, name, role }) {
    return joinShadowGroup({
      element: elementOf(control),
      name,
      role
    });
  }
} satisfies ShadowHost;
