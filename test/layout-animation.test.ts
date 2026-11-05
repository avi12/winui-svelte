import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import { windowPixels } from "./window-pixels.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The layout animation example (examples/layout-animation) in a real WinUI
// window, off screen and never activated, read from the pixels Windows draws
// of it: a red stack with a transparent spacer on top of a blue marker and a
// green probe. Growing the spacer moves the marker down 120 pixels; with
// implicitLayoutAnimation it must be seen between its two places while the
// slide runs, and in the second one when it ends. The probe is moved with
// style:translate on a component, which must draw it elsewhere at once.
// Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const LAYOUT_MILLISECONDS = 1500;
// The example's slide runs 5000 milliseconds; reading the pixels takes about as long as starting powershell.
const PARTWAY_MILLISECONDS = 800;
const PAST_THE_END_MILLISECONDS = 6500;
const ROW_STEP = 10;
const ROWS = 30;
const MARKER_COLUMN = 20;
// The probe sits at the right edge, so the harness finds the red it starts from on the left.
const PROBE_COLUMN = 270;
const RED = "FF0000";
const SHORT_TOP = 40;
const TALL_TOP = 160;
const MARKER_HEIGHT = 60;
const PROBE_PLACE = 120;
const PROBE_DROPPED_PLACE = 180;

type Rgb = ReturnType<typeof windowPixels>[number];

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function isBlue({ r, g, b }: Rgb) {
  return b > 200 && r < 60 && g < 60;
}

function isGreen({ r, g, b }: Rgb) {
  return g > 200 && r < 60 && b < 60;
}

test("a stack slides its children to their new places, and style:translate moves a component", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/layout-animation/main.ts" });
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
    function column({ x, rows }: {
      x: number;
      rows: readonly number[];
    }) {
      return windowPixels({
        pid: example.pid,
        scale,
        origin: RED,
        points: rows.map(y => ({
          x,
          y
        }))
      });
    }

    const scan = Array.from({ length: ROWS }, (_, iRow) => iRow * ROW_STEP + ROW_STEP / 2);
    // The top of the blue marker, to the resolution of the scan.
    async function markerTop() {
      const colors = await column({
        x: MARKER_COLUMN,
        rows: scan
      });
      const iBlue = colors.findIndex(color => isBlue(color));
      const isFound = iBlue >= 0;
      assert.ok(isFound, "the marker is drawn");
      return (scan[iBlue] ?? 0) - ROW_STEP / 2;
    }

    await wait(LAYOUT_MILLISECONDS);
    const first = await markerTop();
    assert.ok(Math.abs(first - SHORT_TOP) <= ROW_STEP, `the marker starts at ${first}`);

    const [probeHere, probeAway] = await column({
      x: PROBE_COLUMN,
      rows: [PROBE_PLACE, PROBE_DROPPED_PLACE]
    });
    assert.ok(probeHere !== undefined && isGreen(probeHere), "the probe is in its place");
    assert.ok(probeAway !== undefined && !isGreen(probeAway), "nothing is drawn where the probe will go");
    await example.ask({
      command: {
        cmd: "drop"
      },
      kind: "dropped"
    });
    await wait(LAYOUT_MILLISECONDS);
    const [probeGone, probeLanded] = await column({
      x: PROBE_COLUMN,
      rows: [PROBE_PLACE, PROBE_DROPPED_PLACE]
    });
    assert.ok(probeGone !== undefined && !isGreen(probeGone), "style:translate moved the probe off its place");
    assert.ok(probeLanded !== undefined && isGreen(probeLanded), "style:translate drew the probe 60 pixels lower");

    await example.ask({
      command: {
        cmd: "grow"
      },
      kind: "grown"
    });
    await wait(PARTWAY_MILLISECONDS);
    const partway = await markerTop();
    await wait(PAST_THE_END_MILLISECONDS);
    const last = await markerTop();
    assert.ok(Math.abs(last - TALL_TOP) <= ROW_STEP, `the marker ends at ${last}`);
    assert.ok(
      partway > SHORT_TOP + ROW_STEP && partway < TALL_TOP - ROW_STEP,
      `partway through the slide the marker (${partway}) is between ${SHORT_TOP} and ${TALL_TOP} (its height is ${MARKER_HEIGHT})`
    );
  } finally {
    await example.stop();
  }
});
