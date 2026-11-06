// The `view-transition-name` property of the CSS part, apart from the entry
// (index.ts) so a window's bundle carries it only when a sheet uses it: the
// module a compiled sheet imports when it has one.

import { viewTransitionGroups as groupsWith } from "./translate/view-transition-properties.ts";
import { nameForTransition } from "#src/renderer/host/view-transition-names.js";

/** The group of `view-transition-name`, keeping each name where `document.startViewTransition` reads it. */
export function viewTransitionGroups() {
  return groupsWith({
    name: nameForTransition
  });
}
