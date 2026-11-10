import { createFeedController, framePeriodMilliseconds } from "./feed-controller.ts";
import { CaptureFormat } from "./format.ts";
import type { CaptureFrame, FrameRequest, FrameSource } from "./frame.ts";
import type { FrameScheduler } from "./scheduler.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const SIZE = {
  width: 4,
  height: 2
};
const BYTES_PER_PIXEL = 4;
const RATE_30 = 30;
const RATE_60 = 60;
const RATE_120 = 120;

function frameOf(request: FrameRequest) {
  return {
    width: request.size.width,
    height: request.size.height,
    pixels: new Uint8Array(request.size.width * request.size.height * BYTES_PER_PIXEL),
    format: CaptureFormat.RGBA,
    region: request.region ?? {
      x: 0,
      y: 0,
      width: 100,
      height: 50
    },
    scale: 1
  } satisfies CaptureFrame;
}

function createFakes() {
  const requests: FrameRequest[] = [];
  const rates: number[] = [];
  let closeCount = 0;
  let isFrameReady = true;
  let failure: Error | undefined = undefined;
  const source: FrameSource = {
    monitorSize: () => SIZE,
    readFrame(request) {
      requests.push(request);
      const pending = failure;
      const isFailing = pending !== undefined;
      if (isFailing) {
        throw pending;
      }

      return isFrameReady ? frameOf(request) : undefined;
    },
    setTargetFramesPerSecond: rate => rates.push(rate),
    close: () => closeCount++
  };
  const timers = new Map<number, {
    intervalMilliseconds: number;
    run: () => void;
  }>();
  let nextTimer = 0;
  const scheduler: FrameScheduler = {
    every(timer) {
      const id = nextTimer++;
      timers.set(id, timer);
      return () => timers.delete(id);
    }
  };
  function tick() {
    for (const timer of timers.values()) {
      timer.run();
    }
  }

  return {
    source,
    scheduler,
    requests,
    rates,
    timers,
    tick,
    closeCount: () => closeCount,
    setFrameReady(isReady: boolean) {
      isFrameReady = isReady;
    },
    fail(error: Error) {
      failure = error;
    }
  };
}

function intervalsOf(fakes: ReturnType<typeof createFakes>) {
  return [...fakes.timers.values()].map(timer => timer.intervalMilliseconds);
}

function start({ fakes, onError }: {
  fakes: ReturnType<typeof createFakes>;
  onError?: (error: unknown) => void;
}) {
  const frames: CaptureFrame[] = [];
  const controller = createFeedController({
    source: fakes.source,
    scheduler: fakes.scheduler,
    targetFramesPerSecond: RATE_60,
    size: SIZE,
    region: null,
    onFrame: frame => frames.push(frame),
    onError
  });
  return {
    controller,
    frames
  };
}

describe("framePeriodMilliseconds", () => {
  it("is the length of one frame", () => {
    assert.ok(Math.abs(framePeriodMilliseconds(RATE_30) * RATE_30 - 1000) < 1e-6);
    assert.ok(framePeriodMilliseconds(RATE_120) < framePeriodMilliseconds(RATE_60));
  });
});

describe("createFeedController", () => {
  it("hands every new frame on and skips a tick with none", () => {
    const fakes = createFakes();
    const { frames } = start({ fakes });
    fakes.tick();
    fakes.setFrameReady(false);
    fakes.tick();
    fakes.setFrameReady(true);
    fakes.tick();
    assert.equal(frames.length, 2);
  });

  it("starts with the rate's period", () => {
    const fakes = createFakes();
    start({ fakes });
    assert.deepEqual(intervalsOf(fakes), [framePeriodMilliseconds(RATE_60)]);
  });

  it("moves and resizes the region between frames, and null goes back to the whole monitor", () => {
    const fakes = createFakes();
    const { controller } = start({ fakes });
    const region = {
      x: 10,
      y: 20,
      width: 300,
      height: 200
    };
    controller.setRegion(region);
    fakes.tick();
    controller.setRegion({
      ...region,
      x: 50,
      width: 640
    });
    fakes.tick();
    controller.setRegion(null);
    fakes.tick();
    assert.deepEqual(fakes.requests.map(request => request.region), [
      region,
      {
        ...region,
        x: 50,
        width: 640
      },
      null
    ]);
  });

  it("rejects a region that is not whole positive pixels, and keeps the old one", () => {
    const fakes = createFakes();
    const { controller } = start({ fakes });
    assert.throws(() => controller.setRegion({
      x: 0,
      y: 0,
      width: 0,
      height: 10
    }));
    assert.throws(() => controller.setRegion({
      x: 0.5,
      y: 0,
      width: 10,
      height: 10
    }));
    fakes.tick();
    assert.equal(fakes.requests[0]?.region, null);
  });

  it("changes the size for the next frame", () => {
    const fakes = createFakes();
    const { controller, frames } = start({ fakes });
    controller.setSize({
      width: 10,
      height: 5
    });
    fakes.tick();
    assert.deepEqual([frames[0]?.width, frames[0]?.height], [10, 5]);
  });

  it("changes the rate: the source is told and the timer restarts at the new period", () => {
    const fakes = createFakes();
    const { controller } = start({ fakes });
    controller.setTargetFramesPerSecond(RATE_120);
    assert.deepEqual(fakes.rates, [RATE_120]);
    assert.deepEqual(intervalsOf(fakes), [framePeriodMilliseconds(RATE_120)]);
    assert.throws(() => controller.setTargetFramesPerSecond(0));
    assert.throws(() => controller.setTargetFramesPerSecond(1000));
  });

  it("closes the source once and stops the timer on dispose, and no frame follows", () => {
    const fakes = createFakes();
    const { controller, frames } = start({ fakes });
    controller.dispose();
    controller.dispose();
    fakes.tick();
    controller.setTargetFramesPerSecond(RATE_30);
    assert.equal(fakes.closeCount(), 1);
    assert.equal(fakes.timers.size, 0);
    assert.equal(frames.length, 0);
    assert.deepEqual(fakes.rates, []);
  });

  it("ends the feed and reports when the source throws", () => {
    const fakes = createFakes();
    const errors: unknown[] = [];
    const { frames } = start({
      fakes,
      onError: error => errors.push(error)
    });
    const failure = new Error("the monitor is gone");
    fakes.fail(failure);
    fakes.tick();
    assert.deepEqual(errors, [failure]);
    assert.equal(fakes.closeCount(), 1);
    assert.equal(fakes.timers.size, 0);
    assert.equal(frames.length, 0);
  });
});
