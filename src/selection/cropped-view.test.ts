import type { FrameRequest } from "#src/capture/frame.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The cropped view over a stand-in for the frames of a monitor: what it asks
// the track to crop to, what the preview frame holds, and the way back to the
// whole monitor. No screen is opened.

const { installMediaDevices, MediaDevices } = await import("#src/web-apis/media-devices.js");
const { CroppedView } = await import("./cropped-view.ts");

type Backend = NonNullable<Parameters<typeof installMediaDevices>[0]>["backend"];

const SURFACE = {
  width: 1000,
  height: 500
};
const CHANNELS = 4;

function fakeFrames() {
  const requests: FrameRequest[] = [];
  const frames = {
    surfaceSize: () => SURFACE,
    readFrame(request: FrameRequest) {
      requests.push(request);
      return {
        width: request.size.width,
        height: request.size.height,
        pixels: new Uint8Array(request.size.width * request.size.height * CHANNELS)
      };
    },
    setTargetFramesPerSecond: () => undefined,
    close: () => undefined
  };
  const backend = {
    access: () => "granted",
    devices: () => Promise.resolve([]),
    onDevicesChanged: () => () => undefined,
    videoModes: () => Promise.resolve([]),
    open: () => Promise.reject(new Error("no camera")),
    pickDisplay: () =>
      Promise.resolve({
        name: "Display 1",
        ...SURFACE,
        surface: "monitor" as const,
        native: undefined,
        cursor: "always" as const,
        frames,
        close: () => undefined
      })
  } satisfies NonNullable<Backend>;
  return {
    requests,
    backend
  };
}

async function withView(run: (context: {
  view: InstanceType<typeof CroppedView>;
  requests: FrameRequest[];
}) => Promise<void>) {
  const fake = fakeFrames();
  const uninstall = installMediaDevices({ backend: fake.backend });
  try {
    const devices: unknown = navigator.mediaDevices;
    assert.ok(devices instanceof MediaDevices);
    const stream = await devices.getDisplayMedia({ video: true });
    const [track] = stream.getVideoTracks();
    assert.ok(track !== undefined);
    await run({
      view: new CroppedView({ track }),
      requests: fake.requests
    });
  } finally {
    uninstall();
  }
}

test("show crops the preview to the rectangle, and reset returns to the whole monitor", async () => {
  await withView(async ({ view, requests }) => {
    assert.equal(view.region, null);
    await view.show({
      x: 100,
      y: 50,
      width: 300,
      height: 200
    });
    const cropped = await view.grabFrame();
    assert.deepEqual([cropped.width, cropped.height], [300, 200]);
    assert.deepEqual(requests.at(-1)?.region, {
      x: 100,
      y: 50,
      width: 300,
      height: 200
    });

    await view.reset();
    assert.equal(view.region, null);
    const whole = await view.grabFrame();
    assert.deepEqual([whole.width, whole.height], [SURFACE.width, SURFACE.height]);
    assert.equal(requests.at(-1)?.region, null);
  });
});

test("moveTo keeps the size and resizeTo keeps the top left", async () => {
  await withView(async ({ view, requests }) => {
    await view.show({
      x: 100,
      y: 50,
      width: 300,
      height: 200
    });
    await view.moveTo({
      x: 400,
      y: 10
    });
    assert.deepEqual(view.region, {
      x: 400,
      y: 10,
      width: 300,
      height: 200
    });
    await view.resizeTo({
      width: 120,
      height: 80
    });
    const frame = await view.grabFrame();
    assert.deepEqual([frame.width, frame.height], [120, 80]);
    assert.deepEqual(requests.at(-1)?.region, {
      x: 400,
      y: 10,
      width: 120,
      height: 80
    });
  });
});

test("moving or resizing before show throws, and a bad rectangle leaves the view as it was", async () => {
  await withView(async ({ view }) => {
    await assert.rejects(
      view.moveTo({
        x: 1,
        y: 1
      }),
      Error
    );
    await view.show({
      x: 0,
      y: 0,
      width: 10,
      height: 10
    });
    await assert.rejects(
      view.resizeTo({
        width: 0,
        height: 10
      }),
      TypeError
    );
    assert.deepEqual(view.region, {
      x: 0,
      y: 0,
      width: 10,
      height: 10
    });
  });
});
