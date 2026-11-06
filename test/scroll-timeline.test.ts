import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import { windowPixels } from "./window-pixels.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The scroll-timeline example (examples/scroll-timeline) in a real WinUI
// window, off screen and never activated. The scroll viewer is moved with
// ScrollViewer.ChangeView (no input is sent); the header, linked to the
// scroll position by `animation-timeline: --page` over 0 to 400 pixels, is read
// back from what Windows draws: its red channel is its opacity, so it must be
// 100, 50 and 0 percent at offsets 0, 200 and 400. The compositor runs the
// expressions on its own thread, so Visual.Opacity read on the UI thread stays
// at its resting value (measured); the pixels are the readback.

const TIMEOUT_MILLISECONDS = 300_000;
const ORIGIN_COLOR = "336699";
const STAGE_RED = 0x33;
const SETTLE_MILLISECONDS = 1500;
const CHANNEL_SLACK = 16;
const FULL_CHANNEL = 255;
const HEADER_X = 240;
const HEADER_CENTER_Y = 60;
const HEADER_TRAVEL = 30;
const RANGE = 400;
const OFFSETS = [0, RANGE / 2, RANGE] as const;

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

test("a header linked to a scroll timeline fades and moves in step with the scroll offset", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/scroll-timeline/main.ts" });
  try {
    const scale = numberOf({
      report: await example.ask({
        command: {
          cmd: "stats"
        },
        kind: "stats"
      }),
      field: "scale"
    });
    for (const offset of OFFSETS) {
      await example.ask({
        command: {
          cmd: "scroll",
          offset
        },
        kind: "scroll"
      });
      await wait(SETTLE_MILLISECONDS);
      const progress = offset / RANGE;
      const [pixel] = windowPixels({
        pid: example.pid,
        scale,
        origin: ORIGIN_COLOR,
        points: [{
          x: HEADER_X,
          y: HEADER_CENTER_Y - HEADER_TRAVEL * progress
        }]
      });
      const expected = FULL_CHANNEL * (1 - progress) + STAGE_RED * progress;
      assert.ok(
        Math.abs((pixel?.r ?? -1) - expected) <= CHANNEL_SLACK,
        `at offset ${offset} the header's red channel is ${pixel?.r}, expected about ${expected}`
      );
    }
  } finally {
    await example.stop();
  }
});
