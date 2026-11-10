import type { CaptureFormat } from "./format.ts";
import type { CaptureFrame, FrameRequest, FrameSource } from "./frame.ts";
import { openMonitorSource } from "./monitor-source.ts";
import type { GrabbedFrame } from "./monitor-source.ts";
import { monitorHandleOf } from "./monitors.ts";
import type { ResolvedMonitor } from "./monitors.ts";
import { createRegionRenderer } from "./region-renderer.ts";
import { capturePlan, isSameRectangle, wholeOf } from "./region.ts";
import { CanvasDevice } from "#winui/microsoft/graphics/canvas/CanvasDevice";
import type { CanvasImageInterpolation } from "#winui/microsoft/graphics/canvas/CanvasImageInterpolation";

/** What `openFrameSource` is given; the monitor is already checked. */
export interface FrameSourceOptions {
  readonly monitor: ResolvedMonitor;
  readonly format: CaptureFormat;
  readonly interpolation: CanvasImageInterpolation;
  readonly targetFramesPerSecond: number;

  /** Draw with Windows' software renderer (WARP) instead of the GPU. */
  readonly isSoftwareRenderer: boolean;
}

/**
 * Opens a monitor as a source of cropped, scaled frames. This is the one
 * place the capture item, the frame pool and Win2D meet.
 *
 * @param options - The monitor, the byte order, the resampling, the rate and the renderer.
 * @returns The source; close it when done.
 * @throws {Error} when there is no such monitor, or Windows refuses the capture
 */
export function openFrameSource({
  monitor,
  format,
  interpolation,
  targetFramesPerSecond,
  isSoftwareRenderer
}: FrameSourceOptions) {
  const device = CanvasDevice.getSharedDevice(isSoftwareRenderer);
  const source = openMonitorSource({
    device,
    monitor: monitorHandleOf(monitor),
    targetFramesPerSecond
  });
  const renderer = createRegionRenderer({
    device,
    format,
    interpolation
  });

  // Windows delivers a frame only when the screen changes. The newest one is
  // kept, so a region that moves over a still screen is drawn again at once.
  let held: GrabbedFrame | undefined = undefined;
  let lastRequest: FrameRequest | undefined = undefined;

  function isRequestChanged(request: FrameRequest) {
    const kept = lastRequest;
    const isFirst = kept === undefined;
    if (isFirst) {
      return true;
    }

    const isSameSize = kept.size.width === request.size.width && kept.size.height === request.size.height;
    return !isSameSize || !isSameRectangle({
      first: kept.region,
      second: request.region
    });
  }

  return {
    monitorSize: source.size,
    readFrame(request: FrameRequest) {
      const fresh = source.nextFrame();
      const isFresh = fresh !== undefined;
      if (isFresh) {
        held?.close();
        held = fresh;
      }

      const current = held;
      const isDrawn = current !== undefined && (isFresh || isRequestChanged(request));
      if (!isDrawn) {
        return undefined;
      }

      lastRequest = request;
      const { region, size } = request;
      const monitorSize = current.bitmap.sizeInPixels;
      const shown = region ?? wholeOf(monitorSize);
      const pixels = renderer.render({
        bitmap: current.bitmap,
        plan: capturePlan({
          monitor: monitorSize,
          region: shown,
          output: size
        }),
        size
      });
      return {
        width: size.width,
        height: size.height,
        pixels,
        format,
        region: shown,
        scale: size.width / shown.width
      } satisfies CaptureFrame;
    },
    setTargetFramesPerSecond: source.setTargetFramesPerSecond,
    close() {
      held?.close();
      held = undefined;
      renderer.close();
      source.close();
    }
  } satisfies FrameSource;
}
