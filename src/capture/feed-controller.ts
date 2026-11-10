import type { CaptureFrame, FrameSource } from "./frame.ts";
import type { Rectangle, Size } from "./region.ts";
import type { FrameScheduler } from "./scheduler.ts";
import { parseFramesPerSecond, parseRegion, parseSize } from "./schema.ts";

// The loop of a feed, apart from Windows: a timer asks a source for the
// newest frame and hands it on. A test drives it with a fake source and timer.

const MILLISECONDS_PER_SECOND = 1000;

/** What `createFeedController` is given; everything is already checked. */
export interface FeedControllerOptions {
  readonly source: FrameSource;
  readonly scheduler: FrameScheduler;
  readonly targetFramesPerSecond: number;
  readonly size: Size;
  readonly region: Rectangle | null;
  readonly onFrame: (frame: CaptureFrame) => void;
  readonly onError: ((error: unknown) => void) | undefined;
}

/**
 * How long a frame lasts.
 *
 * @param framesPerSecond - The rate.
 * @returns The period in milliseconds.
 */
export function framePeriodMilliseconds(framesPerSecond: number) {
  return MILLISECONDS_PER_SECOND / framesPerSecond;
}

/**
 * Runs a source on a timer. The region, the size and the rate can change
 * while it runs; a frame is never queued, and a source or a callback that
 * throws ends the feed and reports the error.
 *
 * @param options - The source, the timer, the starting values and the callbacks.
 * @returns The feed's controls.
 */
export function createFeedController({
  source,
  scheduler,
  targetFramesPerSecond,
  size,
  region,
  onFrame,
  onError
}: FeedControllerOptions) {
  let isDisposed = false;
  let currentRegion = region;
  let currentSize = size;
  let stopTimer: (() => void) | undefined = undefined;

  function dispose() {
    if (isDisposed) {
      return;
    }

    isDisposed = true;
    stopTimer?.();
    source.close();
  }

  function tick() {
    if (isDisposed) {
      return;
    }

    try {
      const frame = source.readFrame({
        region: currentRegion,
        size: currentSize
      });
      const isFrame = frame !== undefined;
      if (isFrame) {
        onFrame(frame);
      }
    } catch (error) {
      dispose();
      onError?.(error);
    }
  }

  function start(framesPerSecond: number) {
    stopTimer = scheduler.every({
      intervalMilliseconds: framePeriodMilliseconds(framesPerSecond),
      run: tick
    });
  }

  start(targetFramesPerSecond);
  return {
    setRegion(next: Rectangle | null) {
      currentRegion = next === null ? null : parseRegion(next);
    },
    setSize(next: Size) {
      currentSize = parseSize(next);
    },
    setTargetFramesPerSecond(framesPerSecond: number) {
      const rate = parseFramesPerSecond(framesPerSecond);
      if (isDisposed) {
        return;
      }

      stopTimer?.();
      source.setTargetFramesPerSecond(rate);
      start(rate);
    },
    dispose
  };
}
