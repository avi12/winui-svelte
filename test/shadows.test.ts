import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import { windowPixels } from "./window-pixels.ts";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// The shadows example (examples/shadows) in a real WinUI window, off screen and
// never activated, read from what Windows draws of it: the box-shadow of cards
// drawn by a Composition DropShadow with its own colour, offset, blur and
// spread. Composition draws these, so no control reports them; the pixels do.
// Skipped where the Windows App SDK or the Win2D library was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const NATIVE_LIBRARY = path.join(import.meta.dirname, "..", ".winapp", "bin", process.arch, "Microsoft.Graphics.Canvas.dll");
const IS_AVAILABLE = IS_WINDOWS_APP_SDK_RESTORED && existsSync(NATIVE_LIBRARY);
const STAGE_COLOR = "DCE6F0";
const SETTLE_MILLISECONDS = 2000;
const CHANNEL_SLACK = 12;
const MIDDLE_Y = 150;
// Four columns of 150: the cards are 100 square, centered in them.
const HARD_CARD_X = 75;
const BLUR_CARD_X = 225;
const RING_CARD_X = 375;
const CARD_BOTTOM = 200;
const CARD_HALF = 50;

type Rgb = ReturnType<typeof windowPixels>[number];

function assertNear({ actual, expected }: {
  actual: Rgb | undefined;
  expected: Rgb;
}) {
  for (const channel of ["r", "g", "b"] as const) {
    assert.ok(actual !== undefined && Math.abs(actual[channel] - expected[channel]) <= CHANNEL_SLACK, `${JSON.stringify(actual)} is not near ${JSON.stringify(expected)}`);
  }
}

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

test("box-shadow with a colour, an offset, a blur and a spread is drawn by Composition", {
  skip: !IS_AVAILABLE,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/shadows/main.ts" });
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
    await wait(SETTLE_MILLISECONDS);
    const [stage, card, hard, outside, blur, ring, ringCard] = windowPixels({
      pid: example.pid,
      scale,
      origin: STAGE_COLOR,
      points: [
        [5, 5],
        [HARD_CARD_X, MIDDLE_Y],
        [HARD_CARD_X + CARD_HALF + 8, MIDDLE_Y],
        [HARD_CARD_X - CARD_HALF - 8, MIDDLE_Y],
        [BLUR_CARD_X, CARD_BOTTOM + 6],
        [RING_CARD_X - CARD_HALF - 4, MIDDLE_Y],
        [RING_CARD_X, MIDDLE_Y]
      ].map(([x = 0, y = 0]) => ({
        x,
        y
      }))
    });
    const white = {
      r: 255,
      g: 255,
      b: 255
    };
    assertNear({
      actual: stage,
      expected: {
        r: 0xdc,
        g: 0xe6,
        b: 0xf0
      }
    });
    assertNear({
      actual: card,
      expected: white
    });
    assertNear({
      actual: hard,
      expected: {
        r: 255,
        g: 0,
        b: 0
      }
    });
    assertNear({
      actual: outside,
      expected: {
        r: 0xdc,
        g: 0xe6,
        b: 0xf0
      }
    });
    assert.ok(blur !== undefined && blur.b - blur.r > CHANNEL_SLACK, `no blue blur under the card: ${JSON.stringify(blur)}`);
    assertNear({
      actual: ring,
      expected: {
        r: 0,
        g: 0xaa,
        b: 0
      }
    });
    assertNear({
      actual: ringCard,
      expected: white
    });
    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});
