// The `clip-path` property of the CSS part, apart from the entry (index.ts) so
// a window's bundle carries it (and Win2D, for a polygon or a path) only when
// a sheet uses it: the module a compiled sheet imports when it has one.

import { clipGroups as groupsWith } from "./translate/clip-properties.ts";
import { nativeVisualHost } from "#src/win2d/visual-host.js";

/** The group of `clip-path`, clipping with a Composition clip. */
export function clipGroups() {
  return groupsWith(nativeVisualHost);
}
