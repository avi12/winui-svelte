import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import { hitTest, screenAreas } from "./window-pixels.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import type { TestContext } from "node:test";
import { test } from "node:test";

// A transparent, borderless, topmost tool window (examples/pointer-overlay) on
// each display, with a real mouse drag over its middle: the web's pointer
// events of its root grid have to arrive. The window opens where it is placed,
// negative origins included. No window of another process is touched: the
// drag is sent only where Windows says the example's own window is on top,
// and the display is skipped otherwise. Skipped without the Windows App SDK.

const TIMEOUT_MILLISECONDS = 300_000;
const SETTLE_MILLISECONDS = 3000;
const WINDOW_WIDTH = 400;
const WINDOW_HEIGHT = 300;
const MARGIN = 400;
const DRAG_SCRIPT = path.join(import.meta.dirname, "..", "examples", "harness", "mouse-drag.ps1");

function dragAt(point: {
  x: number;
  y: number;
}) {
  spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    DRAG_SCRIPT,
    "-X",
    String(point.x),
    "-Y",
    String(point.y)
  ], { encoding: "utf8" });
}

// The example's counts after a drag over its window opened on `area`, or null
// when something else is on top of the window there.
async function dragIn(area: ReturnType<typeof screenAreas>[number]) {
  const x = area.x + MARGIN;
  const y = area.y + MARGIN;
  const example = ExampleProcess.start({
    entry: "examples/pointer-overlay/main.ts",
    flags: [`--view=${x},${y}`],
    env: {
      WINUI_SVELTE_BACKGROUND: ""
    }
  });
  try {
    await example.ask({
      command: {
        cmd: "counts"
      },
      kind: "counts"
    });
    await new Promise(resolve => setTimeout(resolve, SETTLE_MILLISECONDS));
    const middle = {
      x: x + WINDOW_WIDTH / 2,
      y: y + WINDOW_HEIGHT / 2
    };
    const [hit] = hitTest([middle]);
    const isOnTop = hit?.pid === example.pid;
    if (!isOnTop) {
      return null;
    }

    dragAt(middle);
    const report = await example.ask({
      command: {
        cmd: "counts"
      },
      kind: "counts"
    });
    return {
      down: Number(report["down"]),
      move: Number(report["move"]),
      up: Number(report["up"])
    };
  } finally {
    await example.stop();
  }
}

test("a drag over a transparent overlay window raises pointerdown, pointermove and pointerup on every display, left of the primary one included", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async (context: TestContext) => {
  let iChecked = 0;
  for (const area of screenAreas()) {
    const counts = await dragIn(area);
    const isChecked = counts !== null;
    if (isChecked) {
      iChecked++;
      assert.ok(counts.down >= 1, `pointerdown arrived on the display at ${area.x},${area.y}: ${JSON.stringify(counts)}`);
      assert.ok(counts.move >= 1, `pointermove arrived on the display at ${area.x},${area.y}: ${JSON.stringify(counts)}`);
      assert.ok(counts.up >= 1, `pointerup arrived on the display at ${area.x},${area.y}: ${JSON.stringify(counts)}`);
    }
  }

  const isNothingChecked = iChecked === 0;
  if (isNothingChecked) {
    context.skip("another window is on top of the example's on every display");
  }
});

test("a window placed over a whole display is shown at exactly that rectangle, whatever the display's scale", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  for (const { x, y, width, height } of screenAreas()) {
    const placed = {
      x,
      y,
      width,
      height
    };
    const example = ExampleProcess.start({
      entry: "examples/pointer-overlay/main.ts",
      flags: [`--view=${x},${y},${width},${height}`],
      env: {
        WINUI_SVELTE_BACKGROUND: ""
      }
    });
    try {
      const report = await example.ask({
        command: {
          cmd: "counts"
        },
        kind: "counts"
      });
      assert.deepEqual(report["firstBounds"], placed, `the bounds the window was first shown with on the display at ${x},${y}`);
      assert.deepEqual(report["bounds"], placed, "and the bounds it has once loaded");
    } finally {
      await example.stop();
    }
  }
});
