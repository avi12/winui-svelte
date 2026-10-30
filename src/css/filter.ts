// The `filter`, `backdrop-filter`, `mix-blend-mode`, `mask` and `mask-image`
// properties of the CSS part, apart from the entry (index.ts) so a window's
// bundle carries them (and Win2D) only when a sheet uses one: the module a
// compiled sheet imports when it has one.

import { visualEffectGroups as groupsWith } from "./translate/visual-effect-properties.ts";
import { nativeVisualHost } from "#src/win2d/visual-host.js";

/** The groups of the visual effect properties, drawing with Composition and Win2D. */
export function visualEffectGroups() {
  return groupsWith(nativeVisualHost);
}
