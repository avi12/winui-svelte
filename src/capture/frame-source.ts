import type { CaptureFrame, FrameRequest, FrameSource } from "./frame.ts";
import { openMonitorSource } from "./monitor-source.ts";
import type { GrabbedFrame } from "./monitor-source.ts";
import { createRegionRenderer } from "./region-renderer.ts";
import { capturePlan, wholeOf } from "./region.ts";
import { CanvasDevice } from "#winui/microsoft/graphics/canvas/CanvasDevice";
import { CanvasImageInterpolation } from "#winui/microsoft/graphics/canvas/CanvasImageInterpolation";
import type { GraphicsCaptureItem } from "#winui/windows/graphics/capture/GraphicsCaptureItem";

/** What `openFrameSource` is given. */
export interface FrameSourceOptions {
  /** The monitor or window to capture. */
  readonly item: GraphicsCaptureItem;
  readonly targetFramesPerSecond: number;
  readonly isCursorCaptured: boolean;
}

/**
 * Opens a capture item as a source of cropped, scaled RGBA frames. This is
 * the one place the frame pool and Win2D meet. The picture is drawn with a
 * linear filter on the GPU; the device is the shared one.
 *
 * @param options - The item, the rate and whether the cursor is drawn.
 * @returns The source; close it when done.
 * @throws {Error} when Windows refuses the capture
 */
export function openFrameSource({ item, targetFramesPerSecond, isCursorCaptured }: FrameSourceOptions) {
  const device = CanvasDevice.getSharedDevice();
  const source = openMonitorSource({
    device,
    item,
    targetFramesPerSecond,
    isCursorCaptured
  });
  const renderer = createRegionRenderer({
    device,
    interpolation: CanvasImageInterpolation.Linear
  });
  // Windows delivers a frame only when the screen changes: the newest one is kept.
  let held: GrabbedFrame | undefined = undefined;

  return {
    surfaceSize: source.size,
    readFrame({ region, size }: FrameRequest) {
      const fresh = source.nextFrame();
      const isFresh = fresh !== undefined;
      if (isFresh) {
        held?.close();
        held = fresh;
      }

      const current = held;
      const isMissing = current === undefined;
      if (isMissing) {
        return undefined;
      }

      const surface = current.bitmap.sizeInPixels;
      const pixels = renderer.render({
        bitmap: current.bitmap,
        plan: capturePlan({
          surface,
          region: region ?? wholeOf(surface),
          output: size
        }),
        size
      });
      return {
        width: size.width,
        height: size.height,
        pixels
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
