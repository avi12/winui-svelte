import { CaptureFormat } from "./format.ts";
import { openFrameSource } from "./frame-source.ts";
import type { CaptureFrame } from "./frame.ts";
import type { CaptureMonitor } from "./monitors.ts";
import type { Rectangle } from "./region.ts";
import { sizeWithin, wholeOf } from "./region.ts";
import { parseMaxEdge, parseMonitor, parseRegion } from "./schema.ts";
import { CanvasImageInterpolation } from "#winui/microsoft/graphics/canvas/CanvasImageInterpolation";

const POLL_MILLISECONDS = 4;
const DEFAULT_TIMEOUT_MILLISECONDS = 3000;
// Windows is only asked to start; one frame is wanted, as soon as there is one.
const ONE_SHOT_FRAMES_PER_SECOND = 60;

/** What `captureMonitor` is given. */
export interface CaptureMonitorOptions {
  /** The monitor: its rectangle in physical pixels, or a display id. */
  readonly monitor: CaptureMonitor;

  /**
   * The part to capture, in the monitor's own physical pixels from its top
   * left. It is not clipped to the monitor: a part that lies outside is black.
   * The whole monitor when left out.
   */
  readonly region?: Rectangle | undefined;

  /** Shrinks the picture, with a smooth filter on the GPU, until its longest edge is this long. It never enlarges. */
  readonly maxEdge?: number | undefined;

  /** The byte order of `pixels`; `CaptureFormat.RGBA` by default. */
  readonly format?: CaptureFormat | undefined;

  /** Draw with Windows' software renderer (WARP) instead of the GPU. */
  readonly isSoftwareRenderer?: boolean | undefined;

  /** How long to wait for Windows to deliver the frame; 3 seconds by default. */
  readonly timeoutMilliseconds?: number | undefined;
}

function pause(milliseconds: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * One picture of a monitor, or of a region of it, as raw pixels: freeze a
 * screen, or crop a part of it. It starts a capture, takes the first frame,
 * crops and shrinks it on the GPU, and ends the capture. Hand the frame to
 * `encodeJpeg` to send it, or to a bitmap to show it.
 *
 * The caller's own windows are in the picture unless they are excluded from
 * capture (the `isExcludedFromCapture` window prop). A packaged app needs the
 * capture capabilities in its manifest (API.md, "Screen capture").
 *
 * @param options - The monitor, and optionally a region, a size limit and a byte order.
 * @returns The frame: its size, its pixels, the region it shows and the scale.
 * @throws {z.ZodError} when an option is not valid
 * @throws {Error} when there is no such monitor, Windows refuses the capture, or no frame comes in time
 */
export async function captureMonitor({
  monitor,
  region,
  maxEdge,
  format = CaptureFormat.RGBA,
  isSoftwareRenderer = false,
  timeoutMilliseconds = DEFAULT_TIMEOUT_MILLISECONDS
}: CaptureMonitorOptions) {
  const target = parseMonitor(monitor);
  const wanted = region === undefined ? null : parseRegion(region);
  const longestEdge = maxEdge === undefined ? undefined : parseMaxEdge(maxEdge);
  const source = openFrameSource({
    monitor: target,
    format,
    interpolation: CanvasImageInterpolation.HighQualityCubic,
    targetFramesPerSecond: ONE_SHOT_FRAMES_PER_SECOND,
    isSoftwareRenderer
  });
  try {
    const size = sizeWithin({
      size: wanted ?? wholeOf(source.monitorSize()),
      maxEdge: longestEdge
    });
    const deadline = performance.now() + timeoutMilliseconds;
    let frame: CaptureFrame | undefined = undefined;
    while (frame === undefined) {
      frame = source.readFrame({
        region: wanted,
        size
      });
      const isMissing = frame === undefined;
      const isLate = isMissing && performance.now() > deadline;
      if (isLate) {
        throw new Error(`Windows delivered no frame of the monitor in ${timeoutMilliseconds} ms`);
      }

      if (isMissing) {
        await pause(POLL_MILLISECONDS);
      }
    }

    return frame;
  } finally {
    source.close();
  }
}
