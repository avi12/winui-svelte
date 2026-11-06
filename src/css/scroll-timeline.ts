// Scroll-driven animation of the CSS part (`scroll-timeline`, `view-timeline`
// and what links an `animation-timeline` to a scroll viewer), apart from the
// entry (index.ts) so a window's bundle carries Composition's expressions only
// when a sheet uses them: the module a compiled sheet imports when it has one.

import { scrollTimelineGroups as groupsWith } from "./translate/scroll-timeline-properties.ts";
import { nativeScrollHost } from "#src/win2d/scroll-host.js";

/** The group of the scroll and view timelines, linking animations with Composition expressions. */
export function scrollTimelineGroups() {
  return groupsWith(nativeScrollHost);
}
