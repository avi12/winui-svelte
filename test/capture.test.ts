import { BRIGHT_GREEN, brightRectangleOf, BrightWindow, isNear } from "./bright-window.ts";
import type { Color } from "./bright-window.ts";
import { IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import type { Rectangle as PixelsRectangle } from "./window-pixels.ts";
import { screenCapture } from "./window-pixels.ts";
import { roInitialize } from "@microsoft/dynwinrt";
import {
  CaptureFormat,
  captureMonitor,
  createMonitorCaptureFeed,
  encodeJpeg,
  sizeWithin
} from "#src/capture/index.js";
import type { CaptureFrame, Rectangle } from "#src/capture/index.js";
import { windowsImageCodec } from "#src/web-apis/image-codec-windows.js";
import { ImageMimeType } from "#src/web-apis/image-types.js";
import { initWindowsAppSdk } from "#src/window/bootstrap.js";
import { DisplayArea } from "#winui/microsoft/ui/windowing/DisplayArea";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Windows.Graphics.Capture of a monitor (winui-svelte/capture), read against a
// window the test opens: the bright green window of test/bright-window.ts in
// the corner of a display. `captureMonitor` of the monitor, of a region, of a
// region that reaches past the monitor, shrunk, as BGRA and as a JPEG, and a
// live feed whose region moves and resizes over a screen that does not change.
// The windows have to be on the screen the person works at (a desktop of its
// own is not composed), they are never activated, and the bright window sits
// where nothing else covers it: every display is tried and the test is
// skipped, with the reason, when another window covers all of them. Skipped
// too where the Windows App SDK or Win2D was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const NATIVE_LIBRARY = path.join(import.meta.dirname, "..", ".winapp", "bin", process.arch, "Microsoft.Graphics.Canvas.dll");
const IS_AVAILABLE = IS_WINDOWS_APP_SDK_RESTORED && existsSync(NATIVE_LIBRARY);
const SETTLE_MILLISECONDS = 1500;
const FEED_FRAME_MILLISECONDS = 10_000;
const FEED_FRAMES_PER_SECOND = 30;
const CHANNELS = 4;
const INSET = 20;
const PAST_EDGE = 100;
const SHRUNK_EDGE = 100;
const JPEG_QUALITY = 0.9;
const JPEG_START = [0xff, 0xd8];
const SAMPLE_SIZE = 64;
const SAME_SHARE = 0.9;
const RESTARTS = 25;
const BLACK = {
  r: 0,
  g: 0,
  b: 0
};
const FEED_SIZE = {
  width: 96,
  height: 54
};
const MONITOR_RESIDUE = "the monitor shows what the screen shows";
if (IS_AVAILABLE) {
  roInitialize();
  initWindowsAppSdk();
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

// A display where the bright window shows: nothing else covers it, which is when it reads green at its corners.
async function openBrightWindow() {
  for (const area of DisplayArea.findAll() ?? []) {
    const bright = brightRectangleOf(area.workArea);
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
        monitor: area.outerBounds
      };
    }

    opened.close();
  }

  return null;
}

function nextFrame({ frames, count }: {
  frames: readonly CaptureFrame[];
  count: number;
}) {
  return new Promise<CaptureFrame>((resolve, reject) => {
    const started = performance.now();
    const timer = setInterval(() => {
      const frame = frames[count];
      const isArrived = frame !== undefined;
      if (isArrived) {
        clearInterval(timer);
        resolve(frame);
        return;
      }

      const isLate = performance.now() - started > FEED_FRAME_MILLISECONDS;
      if (isLate) {
        clearInterval(timer);
        reject(new Error(`frame ${count} of the feed never came`));
      }
    }, SAMPLE_SIZE / FEED_FRAMES_PER_SECOND);
  });
}

test("captureMonitor and the monitor feed show a known window, cropped, shrunk and encoded", {
  skip: !IS_AVAILABLE,
  timeout: TIMEOUT_MILLISECONDS
}, async context => {
  const found = await openBrightWindow();
  const isCovered = found === null;
  if (isCovered) {
    context.skip("another window covers the bright one on every display, so the screen cannot be read");
    return;
  }

  try {
    const { bright, monitor } = found;
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

    await context.test("a whole monitor is its own size, with the bright window where it is", async () => {
      const frame = await captureMonitor({ monitor });
      assert.equal(frame.width, monitor.width);
      assert.equal(frame.height, monitor.height);
      assert.equal(frame.pixels.length, monitor.width * monitor.height * CHANNELS);
      assert.deepEqual(frame.region, {
        x: 0,
        y: 0,
        width: monitor.width,
        height: monitor.height
      });
      assert.equal(frame.scale, 1);
      assertColor({
        frame,
        x: inMonitor.x + center.x,
        y: inMonitor.y + center.y,
        expected: BRIGHT_GREEN,
        label: MONITOR_RESIDUE
      });
    });

    await context.test("a display id picks the same monitor", async () => {
      const listed = [...DisplayArea.findAll() ?? []];
      const area = listed.find(({ outerBounds }) => outerBounds.x === monitor.x && outerBounds.y === monitor.y);
      assert.ok(area !== undefined, "the display is listed");
      const frame = await captureMonitor({
        monitor: {
          displayId: area.displayId.value
        },
        region: inMonitor
      });
      assert.equal(frame.width, inMonitor.width);
      assertColor({
        frame,
        ...center,
        expected: BRIGHT_GREEN,
        label: "by display id"
      });
    });

    await context.test("a region is its own size and is all the bright window", async () => {
      const region = {
        x: inMonitor.x + INSET,
        y: inMonitor.y + INSET,
        width: inMonitor.width - 2 * INSET,
        height: inMonitor.height - 2 * INSET
      };
      const frame = await captureMonitor({
        monitor,
        region
      });
      assert.deepEqual([frame.width, frame.height], [region.width, region.height]);
      assert.deepEqual(frame.region, region);
      const right = frame.width - 1;
      const bottom = frame.height - 1;
      const probes = [[0, 0], [right, 0], [0, bottom], [right, bottom], [right / 2, bottom / 2]] as const;
      for (const [x, y] of probes) {
        assertColor({
          frame,
          x: Math.floor(x),
          y: Math.floor(y),
          expected: BRIGHT_GREEN,
          label: "inside the region"
        });
      }
    });

    await context.test("a region that reaches past the monitor keeps its size, and what is outside is black", async () => {
      const region = {
        x: inMonitor.x + PAST_EDGE,
        y: inMonitor.y + INSET,
        width: inMonitor.width,
        height: inMonitor.height - 2 * INSET
      };
      const frame = await captureMonitor({
        monitor,
        region
      });
      assert.deepEqual([frame.width, frame.height], [region.width, region.height]);
      assertColor({
        frame,
        x: INSET,
        y: INSET,
        expected: BRIGHT_GREEN,
        label: "the part on the monitor"
      });
      assertColor({
        frame,
        x: frame.width - INSET,
        y: INSET,
        expected: BLACK,
        label: "the part past the monitor's edge"
      });
    });

    await context.test("maxEdge shrinks the longest edge and keeps the proportions", async () => {
      const frame = await captureMonitor({
        monitor,
        region: inMonitor,
        maxEdge: SHRUNK_EDGE
      });
      const expected = sizeWithin({
        size: inMonitor,
        maxEdge: SHRUNK_EDGE
      });
      assert.deepEqual([frame.width, frame.height], [expected.width, expected.height]);
      assert.equal(Math.max(frame.width, frame.height), SHRUNK_EDGE);
      assertColor({
        frame,
        x: Math.floor(frame.width / 2),
        y: Math.floor(frame.height / 2),
        expected: BRIGHT_GREEN,
        label: "shrunk"
      });
    });

    await context.test("BGRA is the same picture with red and blue swapped", async () => {
      const region = {
        x: 0,
        y: 0,
        width: SAMPLE_SIZE,
        height: SAMPLE_SIZE
      };
      const rgba = await captureMonitor({
        monitor,
        region
      });
      const bgra = await captureMonitor({
        monitor,
        region,
        format: CaptureFormat.BGRA
      });
      assert.equal(bgra.format, CaptureFormat.BGRA);
      let matching = 0;
      for (let start = 0; start < rgba.pixels.length; start += CHANNELS) {
        const isSwapped = rgba.pixels[start] === bgra.pixels[start + 2]
          && rgba.pixels[start + 1] === bgra.pixels[start + 1]
          && rgba.pixels[start + 2] === bgra.pixels[start];
        matching += isSwapped ? 1 : 0;
      }

      assert.ok(matching / (SAMPLE_SIZE * SAMPLE_SIZE) >= SAME_SHARE, `${matching} pixels of ${SAMPLE_SIZE * SAMPLE_SIZE} match`);
    });

    await context.test("encodeJpeg makes a JPEG of the asked edge that decodes to the same colour", async () => {
      const frame = await captureMonitor({
        monitor,
        region: inMonitor
      });
      const jpeg = await encodeJpeg({
        frame,
        quality: JPEG_QUALITY,
        maxEdge: SHRUNK_EDGE
      });
      assert.deepEqual([...jpeg.bytes.subarray(0, JPEG_START.length)], JPEG_START);
      assert.equal(Math.max(jpeg.width, jpeg.height), SHRUNK_EDGE);
      assert.equal(jpeg.scale, jpeg.width / frame.width);
      const session = await windowsImageCodec().open(jpeg.bytes);
      assert.equal(session.type, ImageMimeType.JPEG);
      const decoded = await session.decodeFrame({
        frameIndex: 0,
        isOrientationApplied: false
      });
      assert.deepEqual([decoded.width, decoded.height], [jpeg.width, jpeg.height]);
      assertColor({
        frame: {
          pixels: decoded.data,
          width: decoded.width
        },
        x: Math.floor(decoded.width / 2),
        y: Math.floor(decoded.height / 2),
        expected: BRIGHT_GREEN,
        label: "decoded JPEG"
      });
    });

    await context.test("a feed delivers frames of its size, follows a region that moves and resizes over a still screen, and ends on dispose", async () => {
      const frames: CaptureFrame[] = [];
      const errors: unknown[] = [];
      const feed = createMonitorCaptureFeed({
        monitor,
        region: inMonitor,
        targetFramesPerSecond: FEED_FRAMES_PER_SECOND,
        size: FEED_SIZE,
        onFrame: frame => frames.push(frame),
        onError: error => errors.push(error)
      });
      try {
        const first = await nextFrame({
          frames,
          count: 0
        });
        assert.deepEqual([first.width, first.height], [FEED_SIZE.width, FEED_SIZE.height]);
        assert.deepEqual(first.region, inMonitor);
        assertColor({
          frame: first,
          x: FEED_SIZE.width / 2,
          y: FEED_SIZE.height / 2,
          expected: BRIGHT_GREEN,
          label: "feed over the bright window"
        });

        // The region leaves the bright window for the monitor's top left
        // corner: the next frame shows that, though the screen is the same.
        const away = {
          x: 0,
          y: 0,
          width: SAMPLE_SIZE,
          height: SAMPLE_SIZE
        };
        feed.setRegion(away);
        const moved = await nextFrame({
          frames,
          count: frames.length
        });
        assert.deepEqual(moved.region, away);
        const isStillBright = isNear({
          color: colorAt({
            frame: moved,
            x: FEED_SIZE.width / 2,
            y: FEED_SIZE.height / 2
          }),
          expected: BRIGHT_GREEN
        });
        assert.equal(isStillBright, false, "the region moved off the bright window");

        feed.setRegion({
          ...inMonitor,
          x: inMonitor.x + INSET,
          width: inMonitor.width - 2 * INSET
        });
        const resized = await nextFrame({
          frames,
          count: frames.length
        });
        assert.deepEqual(
          [resized.region.width, resized.region.height],
          [inMonitor.width - 2 * INSET, inMonitor.height]
        );
        assertColor({
          frame: resized,
          x: FEED_SIZE.width / 2,
          y: FEED_SIZE.height / 2,
          expected: BRIGHT_GREEN,
          label: "resized region"
        });

        feed.setRegion(null);
        const whole = await nextFrame({
          frames,
          count: frames.length
        });
        assert.deepEqual([whole.region.width, whole.region.height], [monitor.width, monitor.height]);
      } finally {
        feed.dispose();
      }

      const delivered = frames.length;
      await new Promise(resolve => setTimeout(resolve, SETTLE_MILLISECONDS));
      assert.equal(frames.length, delivered, "no frame after dispose");
      assert.deepEqual(errors, []);
    });

    await context.test("a feed started and disposed again and again leaves nothing running", async () => {
      let count = 0;
      for (let iRun = 0; iRun < RESTARTS; iRun++) {
        const feed = createMonitorCaptureFeed({
          monitor,
          targetFramesPerSecond: FEED_FRAMES_PER_SECOND,
          size: FEED_SIZE,
          onFrame: () => count++
        });
        feed.dispose();
      }

      await new Promise(resolve => setTimeout(resolve, SETTLE_MILLISECONDS));
      assert.equal(count, 0, "a disposed feed delivers nothing");
    });
  } finally {
    found.window.close();
  }
});
