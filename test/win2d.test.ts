import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// The Win2D example (examples/win2d) in a real WinUI window, off screen and
// never activated: a Canvas and a Canvas2D (the HTML Canvas 2D API) draw, and
// draw again when their state changes.
// Skipped where the Windows App SDK or the Win2D library was not restored
// (pnpm restore). The drawing itself is proved by pixels, without a window, in
// src/win2d/win2d.test.ts.

const TIMEOUT_MILLISECONDS = 300_000;
const POLL_MILLISECONDS = 500;
const NATIVE_LIBRARY = path.join(import.meta.dirname, "..", ".winapp", "bin", process.arch, "Microsoft.Graphics.Canvas.dll");

async function stats(example: ExampleProcess) {
  return example.ask({
    command: {
      cmd: "stats"
    },
    kind: "stats"
  });
}

async function waitFor({ example, isReady }: {
  example: ExampleProcess;
  isReady: (status: Awaited<ReturnType<typeof stats>>) => boolean;
}) {
  const deadline = Date.now() + TIMEOUT_MILLISECONDS / 2;
  let status = await stats(example);
  while (!isReady(status) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
    status = await stats(example);
  }

  return status;
}

test("a Canvas paints, and paints again when the state its draw function read changes", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED || !existsSync(NATIVE_LIBRARY),
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/win2d/main.ts" });
  try {
    const first = await waitFor({
      example,
      isReady: status => Number(status["redraws"]) > 0
    });
    assert.ok(Number(first["redraws"]) > 0, "the control never raised Draw");
    const runsBefore = Number(first["runs"]);
    const redrawsBefore = Number(first["redraws"]);
    example.send({
      cmd: "blur",
      amount: 12
    });
    const second = await waitFor({
      example,
      isReady: status => Number(status["redraws"]) > redrawsBefore
    });
    assert.equal(second["blurAmount"], 12);
    assert.ok(Number(second["runs"]) > runsBefore, "the draw function did not run again");
    assert.ok(Number(second["redraws"]) > redrawsBefore, "the control did not redraw");
    assert.ok(Number(second["chartRedraws"]) > 0, "the Canvas2D never painted its canvas");
    assert.ok(Number(second["chartWidth"]) > 0, "the canvas did not take the size of its control");
    const chartRunsBefore = Number(second["chartRuns"]);
    const chartRedrawsBefore = Number(second["chartRedraws"]);
    example.send({
      cmd: "chart",
      values: "9,1,5,2"
    });
    const third = await waitFor({
      example,
      isReady: status => Number(status["chartRedraws"]) > chartRedrawsBefore
    });
    assert.ok(Number(third["chartRuns"]) > chartRunsBefore, "the chart did not draw again");
    assert.ok(Number(third["chartRedraws"]) > chartRedrawsBefore, "the Canvas2D did not paint the new chart");
    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});
