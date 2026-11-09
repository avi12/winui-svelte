import {
  boundsOf,
  BRIGHT_GREEN,
  brightRectangleOf,
  BrightWindow,
  FAR_AWAY,
  isNear,
  MARGIN_X,
  MARGIN_Y,
  placeCommand,
  WINDOW_HEIGHT,
  WINDOW_WIDTH
} from "./bright-window.ts";
import type { Color } from "./bright-window.ts";
import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import { hitTest, screenAreas, screenCapture } from "./window-pixels.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// A transparent, click-through window that is only a 3 px ring
// (examples/click-through) over a bright green window that the test opens
// behind it, on the screen the person works at (see transparent-window.test.ts
// for why). Nothing is clicked: Windows is asked who a click would reach
// (WindowFromPoint, the owner of the root window, hit-test.ps1), and the
// screen is read for the ring and the desktop. The same window with
// `--view blocking` (no isClickThrough) is the control: it has to answer with
// the ring's own window, or the question proves nothing. Skipped when another
// window covers the bright one on every display, or without the Windows App SDK.

const TIMEOUT_MILLISECONDS = 300_000;
const SETTLE_MILLISECONDS = 2500;
const RING_PROBE = 1;
const RING_RED = {
  r: 255,
  g: 0,
  b: 0
};
const COVERED = "another window covers the bright one on every display, so the screen cannot be read";

interface Reading {
  brightPid: number;
  examplePid: number;
  hits: Array<{ pid: number }>;
  colors: Color[];
}

// Where the ring and the hole are, in device pixels of the bright window.
function pointsOf() {
  const middleX = MARGIN_X + WINDOW_WIDTH / 2;
  const middleY = MARGIN_Y + WINDOW_HEIGHT / 2;
  return [
    {
      x: MARGIN_X + RING_PROBE,
      y: middleY
    },
    {
      x: middleX,
      y: middleY
    }
  ];
}

// The answers at the ring and the hole, or null where the bright window is covered.
async function read(view: string) {
  const example = ExampleProcess.start({
    entry: "examples/click-through/main.ts",
    flags: ["--view", view],
    env: {
      WINUI_SVELTE_BACKGROUND: ""
    }
  });
  try {
    await example.ask(
      placeCommand({
        x: FAR_AWAY,
        y: FAR_AWAY,
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT
      })
    );
    for (const area of screenAreas()) {
      const reading = await readOver({
        example,
        area
      });
      const isRead = reading !== null;
      if (isRead) {
        return reading;
      }
    }

    return null;
  } finally {
    await example.stop();
  }
}

async function readOver({ example, area }: {
  example: ExampleProcess;
  area: ReturnType<typeof screenAreas>[number];
}) {
  const rectangle = brightRectangleOf(area);
  const points = pointsOf();
  const bright = await BrightWindow.open(rectangle);
  try {
    const bare = screenCapture({
      rectangle,
      points
    });
    const isUncovered = bare.every(color => isNear({
      color,
      expected: BRIGHT_GREEN
    }));
    if (!isUncovered) {
      return null;
    }

    const target = {
      x: rectangle.x + MARGIN_X,
      y: rectangle.y + MARGIN_Y,
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT
    };
    const placed = await example.ask(placeCommand(target));
    assert.deepEqual(boundsOf(placed), target, "the window is where it was placed");
    await new Promise(resolve => setTimeout(resolve, SETTLE_MILLISECONDS));
    return {
      brightPid: bright.pid,
      examplePid: example.pid,
      hits: hitTest(
        points.map(({ x, y }) => ({
          x: rectangle.x + x,
          y: rectangle.y + y
        }))
      ),
      colors: screenCapture({
        rectangle,
        points
      })
    } satisfies Reading;
  } finally {
    bright.close();
  }
}

test("a click-through ring passes a click on the ring and in the hole to the window below, and still draws", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async context => {
  const reading = await read("through");
  const isUnread = reading === null;
  if (isUnread) {
    context.skip(COVERED);
    return;
  }

  const [ring, hole] = reading.colors;
  assert.ok(ring !== undefined && hole !== undefined, "both points were read");
  assert.ok(
    isNear({
      color: ring,
      expected: RING_RED
    }), `the ring is drawn, so click-through did not hide the window: ${JSON.stringify(ring)}`
  );
  assert.ok(
    isNear({
      color: hole,
      expected: BRIGHT_GREEN
    }), `the hole shows the bright window, so click-through did not make the window opaque or black: ${JSON.stringify(hole)}`
  );
  assert.deepEqual(
    reading.hits.map(hit => hit.pid),
    [reading.brightPid, reading.brightPid],
    `a click on the ring and one in the hole reach the window below, not the ring's window (${JSON.stringify(reading.hits)})`
  );
});

test("the control: the same ring without isClickThrough catches a click on the ring", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async context => {
  const reading = await read("blocking");
  const isUnread = reading === null;
  if (isUnread) {
    context.skip(COVERED);
    return;
  }

  const [ringHit] = reading.hits;
  assert.equal(ringHit?.pid, reading.examplePid, `the ring's own window answers where it does not let clicks pass (${JSON.stringify(reading.hits)})`);
});
