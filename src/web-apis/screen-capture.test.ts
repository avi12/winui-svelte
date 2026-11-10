import type { DisplayMediaStreamOptions, MediaStreamTrack } from "./media-devices.ts";
import type { FrameRequest } from "#src/capture/frame.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The web objects of screen capture over a stand-in for the frames of a
// monitor: getDisplayMedia's options reaching the backend, a track that
// crops, limits and delivers frames through ImageCapture, and the errors the
// specs name. No screen is opened.

const { installMediaDevices, MediaDevices } = await import("./media-devices.ts");
const { CropTarget, ImageCapture } = await import("./screen-capture.ts");

type Backend = NonNullable<Parameters<typeof installMediaDevices>[0]>["backend"];
type Request = Parameters<NonNullable<Backend>["pickDisplay"]>[0];

const SURFACE = {
  width: 1000,
  height: 500
};
const CHANNELS = 4;
const MONITOR = {
  x: 0,
  y: 0,
  width: 1000,
  height: 500
};

function fakeFrames(options: { readonly emptyReads?: number } = {}) {
  const requests: FrameRequest[] = [];
  const rates: number[] = [];
  let emptyReads = options.emptyReads ?? 0;
  let closeCount = 0;
  return {
    requests,
    rates,
    closeCount: () => closeCount,
    frames: {
      surfaceSize: () => SURFACE,
      readFrame(request: FrameRequest) {
        requests.push(request);
        const isEmpty = emptyReads > 0;
        if (isEmpty) {
          emptyReads -= 1;
          return undefined;
        }

        return {
          width: request.size.width,
          height: request.size.height,
          pixels: new Uint8Array(request.size.width * request.size.height * CHANNELS).fill(7)
        };
      },
      setTargetFramesPerSecond: (rate: number) => rates.push(rate),
      close: () => closeCount++
    }
  };
}

function fakeBackend(fake: ReturnType<typeof fakeFrames> | undefined) {
  const requests: Request[] = [];
  const backend = {
    access: () => "granted",
    devices: () => Promise.resolve([]),
    onDevicesChanged: () => () => undefined,
    videoModes: () => Promise.resolve([]),
    open: () => Promise.reject(new Error("no camera")),
    pickDisplay(request: Request) {
      requests.push(request);
      const isKnown = request.monitor !== undefined;
      const surface = {
        name: "Display 1",
        ...SURFACE,
        surface: isKnown ? "monitor" as const : "window" as const,
        native: undefined,
        cursor: request.cursor,
        ...fake === undefined ? {} : { frames: fake.frames },
        close: () => fake?.frames.close()
      };
      return Promise.resolve(surface);
    }
  } satisfies NonNullable<Backend>;
  return {
    backend,
    requests
  };
}

async function withTrack({ fake, video, run }: {
  fake: ReturnType<typeof fakeFrames> | undefined;
  video: DisplayMediaStreamOptions;
  run: (track: MediaStreamTrack, requests: Request[]) => Promise<void>;
}) {
  const stand = fakeBackend(fake);
  const uninstall = installMediaDevices({ backend: stand.backend });
  try {
    const devices: unknown = navigator.mediaDevices;
    assert.ok(devices instanceof MediaDevices);
    const stream = await devices.getDisplayMedia(video);
    const [track] = stream.getVideoTracks();
    assert.ok(track !== undefined);
    await run(track, stand.requests);
  } finally {
    uninstall();
  }
}

test("getDisplayMedia passes the monitor, the cursor and the rate to the backend, and shows the picker without a monitor", async () => {
  await withTrack({
    fake: fakeFrames(),
    video: {
      video: {
        monitor: {
          displayId: "123"
        },
        cursor: "never",
        frameRate: {
          max: 30
        }
      }
    },
    run(_track, requests) {
      assert.deepEqual(requests, [{
        cursor: "never",
        monitor: {
          displayId: 123n
        },
        targetFramesPerSecond: 30
      }]);
      return Promise.resolve();
    }
  });
  await withTrack({
    fake: fakeFrames(),
    video: {
      video: true
    },
    run(_track, requests) {
      assert.equal(requests[0]?.monitor, undefined);
      assert.equal(requests[0]?.cursor, "always");
      return Promise.resolve();
    }
  });
  await assert.rejects(
    withTrack({
      fake: undefined,
      video: {
        video: {
          monitor: {
            displayId: "not a number"
          }
        }
      },
      run: () => Promise.resolve()
    }), TypeError
  );
});

test("grabFrame gives the track's picture, cropTo changes it, null returns to the monitor", async () => {
  const fake = fakeFrames();
  await withTrack({
    fake,
    video: {
      video: {
        monitor: MONITOR
      }
    },
    async run(track) {
      const whole = await new ImageCapture(track).grabFrame();
      assert.deepEqual([whole.width, whole.height], [SURFACE.width, SURFACE.height]);
      assert.deepEqual([track.getSettings().width, track.getSettings().height], [SURFACE.width, SURFACE.height]);
      const crop = {
        x: -50,
        y: 10,
        width: 300,
        height: 200
      };
      await track.cropTo(CropTarget.fromRect(crop));
      const cropped = await new ImageCapture(track).grabFrame();
      assert.deepEqual([cropped.width, cropped.height], [300, 200]);
      assert.deepEqual(fake.requests.at(-1)?.region, crop);
      await track.cropTo(null);
      const again = await new ImageCapture(track).grabFrame();
      assert.deepEqual([again.width, again.height], [SURFACE.width, SURFACE.height]);
      assert.equal(fake.requests.at(-1)?.region, null);
      whole.close();
      cropped.close();
      again.close();
    }
  });
});

test("width, height and frameRate limit a display track: shrink to fit, never enlarge, rate told to Windows", async () => {
  const fake = fakeFrames();
  await withTrack({
    fake,
    video: {
      video: {
        monitor: MONITOR
      }
    },
    async run(track) {
      await track.applyConstraints({
        width: {
          max: 200
        },
        height: 200,
        frameRate: 500
      });
      const shrunk = await new ImageCapture(track).grabFrame();
      assert.deepEqual([shrunk.width, shrunk.height], [200, 100]);
      assert.deepEqual(fake.rates.at(-1), 240);
      assert.equal(track.getSettings().frameRate, 240);
      await track.applyConstraints({ width: 5000 });
      const whole = await new ImageCapture(track).grabFrame();
      assert.deepEqual([whole.width, whole.height], [SURFACE.width, SURFACE.height]);
    }
  });
});

test("grabFrame waits for the first frame", async () => {
  const fake = fakeFrames({ emptyReads: 3 });
  await withTrack({
    fake,
    video: {
      video: {
        monitor: MONITOR
      }
    },
    async run(track) {
      const bitmap = await new ImageCapture(track).grabFrame();
      assert.equal(bitmap.width, SURFACE.width);
      assert.equal(fake.requests.length, 4);
    }
  });
});

test("the specs' errors: a bad crop target, a rectangle that is not whole pixels, an ended track, a track that is not a screen", async () => {
  const fake = fakeFrames();
  await withTrack({
    fake,
    video: {
      video: {
        monitor: MONITOR
      }
    },
    async run(track) {
      // @ts-expect-error -- a value that is not a CropTarget is what the standard refuses with a TypeError
      await assert.rejects(track.cropTo({ rectangle: MONITOR }), TypeError);
      assert.throws(() => CropTarget.fromRect({
        ...MONITOR,
        width: 0
      }), TypeError);
      assert.throws(() => CropTarget.fromRect({
        ...MONITOR,
        x: 0.5
      }), TypeError);
      const capture = new ImageCapture(track);
      track.stop();
      assert.equal(fake.closeCount(), 1);
      await assert.rejects(capture.grabFrame(), { name: "InvalidStateError" });
      await assert.rejects(track.cropTo(null), { name: "InvalidStateError" });
    }
  });
  await withTrack({
    fake: undefined,
    video: {
      video: true
    },
    async run(track) {
      await assert.rejects(new ImageCapture(track).grabFrame(), { name: "NotSupportedError" });
      await assert.rejects(track.cropTo(null), { name: "NotSupportedError" });
    }
  });
});
