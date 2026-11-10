import { captureItemOfMonitor } from "./capture-item.ts";
import { framePeriodMilliseconds } from "./feed-controller.ts";
import type { Size } from "./region.ts";
import { read } from "#src/renderer/host/reflect.js";
import { CanvasBitmap } from "#winui/microsoft/graphics/canvas/CanvasBitmap";
import type { CanvasDevice } from "#winui/microsoft/graphics/canvas/CanvasDevice";
import type { Direct3D11CaptureFrame } from "#winui/windows/graphics/capture/Direct3D11CaptureFrame";
import { Direct3D11CaptureFramePool } from "#winui/windows/graphics/capture/Direct3D11CaptureFramePool";
import type { GraphicsCaptureSession } from "#winui/windows/graphics/capture/GraphicsCaptureSession";
import { IDirect3DDevice } from "#winui/windows/graphics/direct-x/direct3-d11/IDirect3DDevice";
import { DirectXPixelFormat } from "#winui/windows/graphics/direct-x/DirectXPixelFormat";

// The capture of one monitor, as far as the frame pool: the item, the pool,
// the session. Frames are polled from the thread that calls `nextFrame`,
// because FrameArrived on a free-threaded pool never fires through dynwinrt
// (a callback from another thread cannot reach JavaScript).

// One buffer is held by the caller (the newest frame is kept), one is being drawn into, one is spare.
const POOL_BUFFER_COUNT = 3;
const TICKS_PER_MILLISECOND = 10_000;
// Windows would otherwise deliver up to the monitor's refresh rate; a share
// of the period asks for a frame a little before the next tick is due.
const MIN_UPDATE_SHARE_OF_PERIOD = 0.75;
const NATIVE_OBJECT = "_obj";

/** A frame of the monitor as a Win2D bitmap, until `close`. */
export interface GrabbedFrame {
  readonly bitmap: CanvasBitmap;
  close(): void;
}

/** What `openMonitorSource` is given. */
export interface MonitorSourceOptions {
  readonly device: CanvasDevice;

  /** The monitor's `HMONITOR`. */
  readonly monitor: bigint;
  readonly targetFramesPerSecond: number;
}

function direct3DDeviceOf(device: CanvasDevice) {
  return IDirect3DDevice.from(read(device, NATIVE_OBJECT));
}

function configure({ session, framesPerSecond }: {
  session: GraphicsCaptureSession;
  framesPerSecond: number;
}) {
  const periodTicks = framePeriodMilliseconds(framesPerSecond) * TICKS_PER_MILLISECOND;
  session.minUpdateInterval = { duration: BigInt(Math.floor(periodTicks * MIN_UPDATE_SHARE_OF_PERIOD)) };
}

// The newest frame waiting; the older ones are given back to the pool, which is how frames are dropped.
function newestFrameOf(pool: Direct3D11CaptureFramePool) {
  let latest: Direct3D11CaptureFrame | null = pool.tryGetNextFrame();
  const isEmpty = latest === null;
  if (isEmpty) {
    return undefined;
  }

  for (let newer = pool.tryGetNextFrame(); newer !== null; newer = pool.tryGetNextFrame()) {
    latest.close();
    latest = newer;
  }

  return latest;
}

/**
 * Starts capturing a monitor, with no border and no cursor.
 *
 * @param options - The Win2D device, the monitor and the rate.
 * @returns `size`, `nextFrame`, `setTargetFramesPerSecond` and `close`.
 * @throws {Error} when Windows refuses the capture (no capability, no consent)
 */
export function openMonitorSource({ device, monitor, targetFramesPerSecond }: MonitorSourceOptions) {
  const item = captureItemOfMonitor(monitor);
  const direct3D = direct3DDeviceOf(device);
  const format = DirectXPixelFormat.B8G8R8A8UIntNormalized;
  let poolSize: Size = item.size;
  const pool = Direct3D11CaptureFramePool.createFreeThreaded(direct3D, format, POOL_BUFFER_COUNT, poolSize);
  const session = pool.createCaptureSession(item);
  session.isBorderRequired = false;
  session.isCursorCaptureEnabled = false;
  configure({
    session,
    framesPerSecond: targetFramesPerSecond
  });
  session.startCapture();

  return {
    size: () => poolSize,
    nextFrame() {
      const frame = newestFrameOf(pool);
      const isMissing = frame === undefined;
      if (isMissing) {
        return undefined;
      }

      const { contentSize } = frame;
      const isResized = contentSize.width !== poolSize.width || contentSize.height !== poolSize.height;
      if (isResized) {
        poolSize = contentSize;
        pool.recreate(direct3D, format, POOL_BUFFER_COUNT, poolSize);
      }

      const bitmap = CanvasBitmap.createFromDirect3D11Surface(device, frame.surface);
      return {
        bitmap,
        close() {
          bitmap.close();
          frame.close();
        }
      } satisfies GrabbedFrame;
    },
    setTargetFramesPerSecond(framesPerSecond: number) {
      configure({
        session,
        framesPerSecond
      });
    },
    close() {
      session.close();
      pool.close();
    }
  };
}
