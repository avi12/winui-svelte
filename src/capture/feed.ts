import { createFeedController } from "./feed-controller.ts";
import { CaptureFormat } from "./format.ts";
import { openFrameSource } from "./frame-source.ts";
import type { CaptureFrame } from "./frame.ts";
import type { CaptureMonitor } from "./monitors.ts";
import type { Rectangle, Size } from "./region.ts";
import { createTimerScheduler } from "./scheduler.ts";
import { parseFramesPerSecond, parseMonitor, parseRegion, parseSize } from "./schema.ts";
import { CanvasImageInterpolation } from "#winui/microsoft/graphics/canvas/CanvasImageInterpolation";

/** What `createMonitorCaptureFeed` is given. */
export interface MonitorCaptureFeedOptions {
  /** The monitor: its rectangle in physical pixels, or a display id. */
  readonly monitor: CaptureMonitor;

  /** The part to show to begin with, in the monitor's physical pixels; the whole monitor when left out. */
  readonly region?: Rectangle | undefined;

  /** The most frames a second to deliver, from 1 to 240; Windows is asked for no more, and a frame is never queued. */
  readonly targetFramesPerSecond: number;

  /** The size of every frame; the region (or the monitor) is stretched to fill it. */
  readonly size: Size;

  /** Draw with Windows' software renderer (WARP) instead of the GPU: slower, never fails for want of a GPU. */
  readonly isSoftwareRenderer?: boolean | undefined;

  /** The byte order of `pixels`; `CaptureFormat.RGBA` by default. */
  readonly format?: CaptureFormat | undefined;

  /** Gets each frame, on the thread that made the feed. */
  readonly onFrame: (frame: CaptureFrame) => void;

  /**
   * Hears why the feed ended by itself (the monitor went away, Windows
   * stopped the capture); it has been disposed by then.
   */
  readonly onError?: ((error: unknown) => void) | undefined;
}

/**
 * A live feed of a monitor, or of a movable, resizable region of it, for a
 * preview tile or for sending only a rectangle of a display. Frames are polled
 * on a drift-corrected timer of the calling thread (FrameArrived never fires
 * through dynwinrt); the crop and the downscale run on the GPU before the
 * readback, so a frame costs a capture, a draw and a few kilobytes of copy.
 * With no new frame at a tick, nothing is delivered.
 *
 * The capture has no border and no cursor. A packaged app needs the capture
 * capabilities in its manifest (API.md, "Screen capture"). Dispose the feed to
 * end the capture.
 *
 * @param options - The monitor, the rate, the frame size and the callbacks.
 * @returns `setRegion(region | null)` moves or resizes the region (null for the whole monitor),
 *     `setSize(size)` changes the frame size, `setTargetFramesPerSecond(n)` the rate, and `dispose()` ends it.
 * @throws {z.ZodError} when an option is not valid
 * @throws {Error} when there is no such monitor, or Windows refuses the capture
 */
export function createMonitorCaptureFeed({
  monitor,
  region,
  targetFramesPerSecond,
  size,
  isSoftwareRenderer = false,
  format = CaptureFormat.RGBA,
  onFrame,
  onError
}: MonitorCaptureFeedOptions) {
  const rate = parseFramesPerSecond(targetFramesPerSecond);
  const frameSize = parseSize(size);
  const initialRegion = region === undefined ? null : parseRegion(region);
  const source = openFrameSource({
    monitor: parseMonitor(monitor),
    format,
    interpolation: CanvasImageInterpolation.Linear,
    targetFramesPerSecond: rate,
    isSoftwareRenderer
  });
  return createFeedController({
    source,
    scheduler: createTimerScheduler(),
    targetFramesPerSecond: rate,
    size: frameSize,
    region: initialRegion,
    onFrame,
    onError
  });
}
