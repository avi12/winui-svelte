// Telling a screen reader what happened: a message raised as a UI Automation
// notification, and elements whose text changes are spoken (ARIA's live regions).

export { announce } from "./announce.ts";
export type { AnnounceOptions } from "./announce.ts";
export { LivePriority } from "./live-priority.ts";
export { liveRegion } from "./live-region.ts";
export type { LiveRegionOptions } from "./live-region.ts";
