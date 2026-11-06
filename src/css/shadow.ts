// The `-winui-shadow`, `-winui-shadow-receiver` and `-winui-shadow-cast-on`
// properties of the CSS part, apart from the entry (index.ts) so a window's
// bundle carries them (and Win2D) only when a sheet uses one: the module a
// compiled sheet imports when it has one.

import { shadowGroups as groupsWith } from "./translate/shadow-properties.ts";
import { nativeShadowHost } from "#src/win2d/shadow-host.js";

/** The groups of the shadow properties, drawing with Composition. */
export function shadowGroups() {
  return groupsWith(nativeShadowHost);
}
