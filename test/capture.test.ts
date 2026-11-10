import { BRIGHT_GREEN, brightRectangleOf, BrightWindow, isNear } from "./bright-window.ts";
import type { Color } from "./bright-window.ts";
import { IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import type { Rectangle as PixelsRectangle } from "./window-pixels.ts";
import { screenCapture } from "./window-pixels.ts";
import { roInitialize } from "@microsoft/dynwinrt";
import { createImageBitmap, installImageCodecs } from "#src/web-apis/images.js";
import { installMediaDevices, MediaDevices } from "#src/web-apis/media-devices.js";
import type { MediaStreamTrack } from "#src/web-apis/media-devices.js";
import { CropTarget, ImageCapture } from "#src/web-apis/screen-capture.js";
import { createCanvas2D } from "#src/win2d/context-2d/canvas-element.js";
import { initWindowsAppSdk } from "#src/window/bootstrap.js";
import { DisplayArea } from "#winui/microsoft/ui/windowing/DisplayArea";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Screen capture through the web's own objects, read against a window the
// test opens: the bright green window of test/bright-window.ts in the corner
// of a display. `navigator.mediaDevices.getDisplayMedia({ video: { monitor } })`
// opens the monitor with no picker; `new ImageCapture(track).grabFrame()`
// reads it; `track.cropTo(CropTarget.fromRect(...))` crops it, also past the
// monitor's edge; `applyConstraints({ width, height })` shrinks it on the GPU;
// a canvas encodes a frame to a JPEG; and a loop of grabs follows a region
// that moves and resizes over a screen that does not change. The windows have
// to be on the screen the person works at (a desktop of its own is not
// composed), they are never activated, and the bright window sits where
// nothing else covers it: every display is tried and the test is skipped, with
// the reason, when another window covers all of them. Skipped too where the
// Windows App SDK or Win2D was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const NATIVE_LIBRARY = path.join(import.meta.dirname, "..", ".winapp", "bin", process.arch, "Microsoft.Graphics.Canvas.dll");
const IS_AVAILABLE = IS_WINDOWS_APP_SDK_RESTORED && existsSync(NATIVE_LIBRARY);
const SETTLE_MILLISECONDS = 1500;
const CHANNELS = 4;
const INSET = 20;
const PAST_EDGE = 100;
const SHRUNK_EDGE = 100;
const JPEG_QUALITY = 0.9;
const JPEG_START = [0xff, 0xd8];
const LOOP_MILLISECONDS = 1500;
const LOOP_FRAMES_PER_SECOND = 30;
const RESTARTS = 25;
const BLACK = {
  r: 0,
  g: 0,
  b: 0
};
if (IS_AVAILABLE) {
  roInitialize();
  initWindowsAppSdk();
}

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PixelGrid {
  readonly pixels: Uint8Array | Uint8ClampedArray;
  readonly width: number;
}

function colorAt({ frame, x, y }: {
  frame: PixelGrid;
  x: number;
  y: number;
}) {
  const start = (y * frame.width + x) * CHANNELS;
  return {
    r: frame.pixels[start] ?? 0,
    g: frame.pixels[start + 1] ?? 0,
    b: frame.pixels[start + 2] ?? 0
  } satisfies Color;
}

function assertColor({ frame, x, y, expected, label }: {
  frame: PixelGrid;
  x: number;
  y: number;
  expected: Color;
  label: string;
}) {
  const color = colorAt({
    frame,
    x,
    y
  });
  assert.ok(
    isNear({
      color,
      expected
    }), `${label}: ${JSON.stringify(color)} at ${x},${y} is not near ${JSON.stringify(expected)}`
  );
}

// The four corners of a work area, where the bright window may sit.
function cornersOf(workArea: Rectangle) {
  const { width, height } = brightRectangleOf(workArea);
  const right = workArea.x + workArea.width - width;
  const bottom = workArea.y + workArea.height - height;
  return [
    {
      x: right,
      y: bottom
    },
    {
      x: workArea.x,
      y: workArea.y
    },
    {
      x: right,
      y: workArea.y
    },
    {
      x: workArea.x,
      y: bottom
    }
  ].map(corner => ({
    ...corner,
    width,
    height
  }));
}

// A place where the bright window shows: nothing else covers it, which is when it reads green at its corners.
async function openBrightWindow() {
  const candidates = [...DisplayArea.findAll() ?? []].flatMap(area => cornersOf(area.workArea).map(bright => ({
    area,
    bright
  })));
  for (const { area, bright } of candidates) {
    const opened = await BrightWindow.open(bright);
    await new Promise(resolve => setTimeout(resolve, SETTLE_MILLISECONDS));
    const probes = [
      {
        x: INSET,
        y: INSET
      },
      {
        x: bright.width - INSET,
        y: bright.height - INSET
      }
    ];
    const seen = screenCapture({
      rectangle: bright satisfies PixelsRectangle,
      points: probes
    });
    const isUncovered = seen.every(color => isNear({
      color,
      expected: BRIGHT_GREEN
    }));
    if (isUncovered) {
      return {
        window: opened,
        bright,
        monitor: area.outerBounds,
        displayId: area.displayId.value
      };
    }

    opened.close();
  }

  return null;
}

function devicesOf() {
  const mediaDevices: unknown = navigator.mediaDevices;
  assert.ok(mediaDevices instanceof MediaDevices);
  return mediaDevices;
}

// One frame of a track, as a grid of RGBA pixels; the bitmap is closed.
async function grab(track: MediaStreamTrack) {
  const bitmap = await new ImageCapture(track).grabFrame();
  try {
    const { data, width, height } = bitmap.toImageData();
    return {
      pixels: data,
      width,
      height
    };
  } finally {
    bitmap.close();
  }
}

test("getDisplayMedia, ImageCapture and cropTo read a known window on a monitor chosen without the picker", {
  skip: !IS_AVAILABLE,
  timeout: TIMEOUT_MILLISECONDS
}, async context => {
  const found = await openBrightWindow();
  const isCovered = found === null;
  if (isCovered) {
    context.skip("another window covers the bright one on every display, so the screen cannot be read");
    return;
  }

  const uninstallDevices = installMediaDevices();
  const uninstallCodecs = installImageCodecs();
  try {
    const { bright, monitor, displayId } = found;
    const inMonitor: Rectangle = {
      x: bright.x - monitor.x,
      y: bright.y - monitor.y,
      width: bright.width,
      height: bright.height
    };
    const center = {
      x: Math.floor(inMonitor.width / 2),
      y: Math.floor(inMonitor.height / 2)
    };
    const inside: Rectangle = {
      x: inMonitor.x + INSET,
      y: inMonitor.y + INSET,
      width: inMonitor.width - 2 * INSET,
      height: inMonitor.height - 2 * INSET
    };

    async function openTrack(video: Parameters<MediaDevices["getDisplayMedia"]>[0]) {
      const stream = await devicesOf().getDisplayMedia(video);
      const [track] = stream.getVideoTracks();
      assert.ok(track !== undefined, "the stream has a video track");
      return track;
    }

    await context.test("a whole monitor, by rectangle, is its own size with the window where it is", async () => {
      const track = await openTrack({
        video: {
          monitor
        }
      });
      try {
        const settings = track.getSettings();
        assert.equal(settings.displaySurface, "monitor");
        assert.deepEqual([settings.width, settings.height], [monitor.width, monitor.height]);
        const frame = await grab(track);
        assert.deepEqual([frame.width, frame.height], [monitor.width, monitor.height]);
        assert.equal(frame.pixels.length, monitor.width * monitor.height * CHANNELS);
        assertColor({
          frame,
          x: inMonitor.x + center.x,
          y: inMonitor.y + center.y,
          expected: BRIGHT_GREEN,
          label: "the monitor shows what the screen shows"
        });
      } finally {
        track.stop();
      }
    });

    await context.test("a display id picks the same monitor", async () => {
      const track = await openTrack({
        video: {
          monitor: {
            displayId
          }
        }
      });
      try {
        await track.cropTo(CropTarget.fromRect(inMonitor));
        const frame = await grab(track);
        assert.deepEqual([frame.width, frame.height], [inMonitor.width, inMonitor.height]);
        assertColor({
          frame,
          ...center,
          expected: BRIGHT_GREEN,
          label: "by display id"
        });
      } finally {
        track.stop();
      }
    });

    await context.test("cropTo keeps the rectangle's size and shows only it, and null returns to the monitor", async () => {
      const track = await openTrack({
        video: {
          monitor
        }
      });
      try {
        await track.cropTo(CropTarget.fromRect(inside));
        const frame = await grab(track);
        assert.deepEqual([frame.width, frame.height], [inside.width, inside.height]);
        assert.deepEqual([track.getSettings().width, track.getSettings().height], [inside.width, inside.height]);
        const right = frame.width - 1;
        const bottom = frame.height - 1;
        for (const [x, y] of [[0, 0], [right, 0], [0, bottom], [right, bottom], [right / 2, bottom / 2]] as const) {
          assertColor({
            frame,
            x: Math.floor(x),
            y: Math.floor(y),
            expected: BRIGHT_GREEN,
            label: "inside the crop"
          });
        }

        await track.cropTo(null);
        const whole = await grab(track);
        assert.deepEqual([whole.width, whole.height], [monitor.width, monitor.height]);
      } finally {
        track.stop();
      }
    });

    await context.test("a crop that reaches past the monitor keeps its size, and what is outside is black", async () => {
      const track = await openTrack({
        video: {
          monitor
        }
      });
      try {
        const corner = {
          x: 0,
          y: 0,
          width: 3 * PAST_EDGE,
          height: 3 * PAST_EDGE
        };
        const past = {
          x: -PAST_EDGE,
          y: -PAST_EDGE,
          width: 3 * PAST_EDGE,
          height: 3 * PAST_EDGE
        };
        await track.cropTo(CropTarget.fromRect(corner));
        const onMonitor = await grab(track);
        await track.cropTo(CropTarget.fromRect(past));
        const frame = await grab(track);
        assert.deepEqual([frame.width, frame.height], [past.width, past.height]);
        assertColor({
          frame,
          x: INSET,
          y: INSET,
          expected: BLACK,
          label: "the part past the monitor's top left edge"
        });
        const probe = PAST_EDGE / 2;
        assertColor({
          frame,
          x: PAST_EDGE + probe,
          y: PAST_EDGE + probe,
          expected: colorAt({
            frame: onMonitor,
            x: probe,
            y: probe
          }),
          label: "the part on the monitor is where the crop without the edge has it"
        });
      } finally {
        track.stop();
      }
    });

    await context.test("applyConstraints limits the size on the GPU and keeps the proportions", async () => {
      const track = await openTrack({
        video: {
          monitor
        }
      });
      try {
        await track.cropTo(CropTarget.fromRect(inMonitor));
        await track.applyConstraints({
          width: {
            max: SHRUNK_EDGE
          },
          height: {
            max: SHRUNK_EDGE
          }
        });
        const frame = await grab(track);
        assert.equal(Math.max(frame.width, frame.height), SHRUNK_EDGE);
        assert.ok(Math.abs(frame.width / frame.height - inMonitor.width / inMonitor.height) < 0.05);
        assertColor({
          frame,
          x: Math.floor(frame.width / 2),
          y: Math.floor(frame.height / 2),
          expected: BRIGHT_GREEN,
          label: "shrunk"
        });
        assert.deepEqual([track.getSettings().width, track.getSettings().height], [frame.width, frame.height]);
      } finally {
        track.stop();
      }
    });

    await context.test("a frame drawn on a canvas encodes to a JPEG that decodes to the same colour", async () => {
      const track = await openTrack({
        video: {
          monitor
        }
      });
      try {
        await track.cropTo(CropTarget.fromRect(inMonitor));
        const bitmap = await new ImageCapture(track).grabFrame();
        const canvas = createCanvas2D({
          width: bitmap.width,
          height: bitmap.height
        });
        const drawing = canvas.getContext("2d");
        assert.ok(drawing);
        drawing.drawImage(bitmap, 0, 0);
        bitmap.close();
        const blob = await canvas.convertToBlob({
          type: "image/jpeg",
          quality: JPEG_QUALITY
        });
        assert.equal(blob.type, "image/jpeg");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        assert.deepEqual([...bytes.subarray(0, JPEG_START.length)], JPEG_START);
        const decoded = await createImageBitmap(blob);
        assert.deepEqual([decoded.width, decoded.height], [inMonitor.width, inMonitor.height]);
        assertColor({
          frame: {
            pixels: decoded.toImageData().data,
            width: decoded.width
          },
          ...center,
          expected: BRIGHT_GREEN,
          label: "decoded JPEG"
        });
      } finally {
        track.stop();
      }
    });

    await context.test("a loop of grabs follows a crop that moves and resizes over a still screen", async () => {
      const track = await openTrack({
        video: {
          monitor,
          frameRate: LOOP_FRAMES_PER_SECOND
        }
      });
      try {
        const regions = [
          inMonitor,
          {
            x: 0,
            y: 0,
            width: 64,
            height: 64
          },
          inside
        ];
        const seen: Array<{
          width: number;
          height: number;
          isGreen: boolean;
        }> = [];
        const started = performance.now();
        for (let iGrab = 0; performance.now() - started < LOOP_MILLISECONDS; iGrab++) {
          const region = regions[Math.floor(iGrab / 10) % regions.length];
          assert.ok(region !== undefined);
          await track.cropTo(CropTarget.fromRect(region));
          const frame = await grab(track);
          assert.deepEqual([frame.width, frame.height], [region.width, region.height], "the frame is the crop's size");
          seen.push({
            width: frame.width,
            height: frame.height,
            isGreen: isNear({
              color: colorAt({
                frame,
                x: Math.floor(frame.width / 2),
                y: Math.floor(frame.height / 2)
              }),
              expected: BRIGHT_GREEN
            })
          });
          await new Promise(resolve => setTimeout(resolve, 1000 / LOOP_FRAMES_PER_SECOND));
        }

        assert.ok(seen.length >= LOOP_FRAMES_PER_SECOND, `${seen.length} frames in ${LOOP_MILLISECONDS} ms`);
        assert.ok(seen.some(frame => frame.isGreen), "the crop over the window shows it");
        assert.ok(seen.some(frame => !frame.isGreen), "the crop away from the window does not");
      } finally {
        track.stop();
      }
    });

    await context.test("a stopped track delivers no frame, a bad target is refused, a camera-less track is not a screen", async () => {
      const track = await openTrack({
        video: {
          monitor
        }
      });
      const capture = new ImageCapture(track);
      // @ts-expect-error -- a value that is not a CropTarget is what the standard refuses with a TypeError
      await assert.rejects(track.cropTo({ rectangle: inMonitor }), TypeError);
      assert.throws(() => CropTarget.fromRect({
        ...inMonitor,
        width: 0
      }), TypeError);
      track.stop();
      await assert.rejects(capture.grabFrame(), { name: "InvalidStateError" });
      await assert.rejects(track.cropTo(null), { name: "InvalidStateError" });
    });

    await context.test("tracks opened and stopped again and again leave nothing running", async () => {
      for (let iRun = 0; iRun < RESTARTS; iRun++) {
        const track = await openTrack({
          video: {
            monitor
          }
        });
        track.stop();
      }
    });
  } finally {
    uninstallCodecs();
    uninstallDevices();
    found.window.close();
  }
});
