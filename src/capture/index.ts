// The opt-in screen capture part of the package: `winui-svelte/capture`.
// Nothing of it is loaded by an app that does not import it, and nothing runs
// at import time: Windows.Graphics.Capture and Win2D are touched by the first
// call.

export { captureMonitor } from "./capture-monitor.ts";
export type { CaptureMonitorOptions } from "./capture-monitor.ts";
export { createMonitorCaptureFeed } from "./feed.ts";
export type { MonitorCaptureFeedOptions } from "./feed.ts";
export { CaptureFormat } from "./format.ts";
export type { CaptureFrame } from "./frame.ts";
export { encodeJpeg } from "./jpeg.ts";
export type { EncodedJpeg, EncodeJpegOptions } from "./jpeg.ts";
export type { CaptureMonitor } from "./monitors.ts";
export { capturePlan, overlapOf, sizeWithin, wholeOf } from "./region.ts";
export type { CapturePlan, CapturePlanOptions, Rectangle, Size } from "./region.ts";
export { shrinkPixels } from "./resample.ts";
