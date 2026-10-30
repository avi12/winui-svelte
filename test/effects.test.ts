import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import { windowPixels } from "./window-pixels.ts";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// The effects example (examples/effects) in a real WinUI window, off screen and
// never activated, read from what Windows draws of it: the CSS filter,
// backdrop-filter, mix-blend-mode, mask-image and clip-path of a border that
// sits over a red and a blue half. Composition draws these, so no control
// reports them; the pixels do. Skipped where the Windows App SDK or the Win2D
// library was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const NATIVE_LIBRARY = path.join(import.meta.dirname, "..", ".winapp", "bin", process.arch, "Microsoft.Graphics.Canvas.dll");
const IS_AVAILABLE = IS_WINDOWS_APP_SDK_RESTORED && existsSync(NATIVE_LIBRARY);
const STAGE_COLOR = "FF0000";
const SETTLE_MILLISECONDS = 1500;
const CHANNEL_SLACK = 12;
// The border is 160 by 100, centered in a stage 480 by 330: these are its places.
const LEFT = 160;
const TOP = 115;
const RIGHT = 320;
const BOTTOM = 215;
const MIDDLE_Y = 165;
const MIDDLE_X = 240;

type Rgb = ReturnType<typeof windowPixels>[number];

function assertNear({ actual, expected }: {
  actual: Rgb;
  expected: Rgb;
}) {
  for (const channel of ["r", "g", "b"] as const) {
    assert.ok(Math.abs(actual[channel] - expected[channel]) <= CHANNEL_SLACK, `${JSON.stringify(actual)} is not near ${JSON.stringify(expected)}`);
  }
}

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

test("filter, backdrop-filter, mix-blend-mode, mask-image and clip-path change what is drawn", {
  skip: !IS_AVAILABLE,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/effects/main.ts" });
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
    async function colorsWith({ className, points }: {
      className: string;
      points: Array<[number, number]>;
    }) {
      await example.ask({
        command: {
          cmd: "set",
          class: className
        },
        kind: "set"
      });
      await wait(SETTLE_MILLISECONDS);
      return windowPixels({
        pid: example.pid,
        scale,
        origin: STAGE_COLOR,
        points: points.map(([x, y]) => ({
          x,
          y
        }))
      });
    }

    const [plainYellow = null, plainGreen = null] = await colorsWith({
      className: "",
      points: [[MIDDLE_X, MIDDLE_Y], [LEFT + 10, MIDDLE_Y]]
    });
    assertNear({
      actual: plainYellow ?? {
        r: 0,
        g: 0,
        b: 0
      },
      expected: {
        r: 255,
        g: 255,
        b: 0
      }
    });
    assertNear({
      actual: plainGreen ?? {
        r: 0,
        g: 0,
        b: 0
      },
      expected: {
        r: 0,
        g: 170,
        b: 0
      }
    });

    const [gray = null] = await colorsWith({
      className: "fx-gray",
      points: [[MIDDLE_X, MIDDLE_Y - 20]]
    });
    assert.ok(gray !== null && Math.abs(gray.r - gray.g) <= CHANNEL_SLACK && Math.abs(gray.g - gray.b) <= CHANNEL_SLACK, `not gray: ${JSON.stringify(gray)}`);

    const [halo = null] = await colorsWith({
      className: "fx-blur",
      points: [[LEFT - 5, MIDDLE_Y]]
    });
    assert.ok(halo !== null && halo.g > CHANNEL_SLACK, `the blur did not reach outside the element: ${JSON.stringify(halo)}`);

    const [shadow = null] = await colorsWith({
      className: "fx-shadow",
      points: [[RIGHT + 4, MIDDLE_Y + 20]]
    });
    assert.ok(shadow !== null && shadow.b < 80, `no shadow beside the element: ${JSON.stringify(shadow)}`);

    const [multiplied = null] = await colorsWith({
      className: "fx-multiply",
      points: [[LEFT + 10, MIDDLE_Y]]
    });
    assertNear({
      actual: multiplied ?? {
        r: 255,
        g: 255,
        b: 255
      },
      expected: {
        r: 0,
        g: 0,
        b: 0
      }
    });

    const [faded = null] = await colorsWith({
      className: "fx-mask",
      points: [[RIGHT - 4, MIDDLE_Y]]
    });
    assert.ok(faded !== null && faded.b > 200 && faded.r < 60, `the mask did not fade the end: ${JSON.stringify(faded)}`);

    const [frosted = null] = await colorsWith({
      className: "fx-backdrop",
      points: [[LEFT + 60, MIDDLE_Y]]
    });
    assertNear({
      actual: frosted ?? {
        r: 0,
        g: 0,
        b: 0
      },
      expected: {
        r: 255,
        g: 77,
        b: 0
      }
    });

    const [circleCorner = null, circleCenter = null] = await colorsWith({
      className: "fx-circle",
      points: [[LEFT + 3, TOP + 3], [MIDDLE_X, MIDDLE_Y]]
    });
    assertNear({
      actual: circleCorner ?? {
        r: 0,
        g: 0,
        b: 0
      },
      expected: {
        r: 255,
        g: 0,
        b: 0
      }
    });
    assertNear({
      actual: circleCenter ?? {
        r: 0,
        g: 0,
        b: 0
      },
      expected: {
        r: 255,
        g: 255,
        b: 0
      }
    });

    const [triangleCorner = null, triangleBase = null] = await colorsWith({
      className: "fx-polygon",
      points: [[LEFT + 8, TOP + 8], [MIDDLE_X, BOTTOM - 8]]
    });
    assertNear({
      actual: triangleCorner ?? {
        r: 0,
        g: 0,
        b: 0
      },
      expected: {
        r: 255,
        g: 0,
        b: 0
      }
    });
    assertNear({
      actual: triangleBase ?? {
        r: 0,
        g: 0,
        b: 0
      },
      expected: {
        r: 255,
        g: 255,
        b: 0
      }
    });

    const [roundCorner = null] = await colorsWith({
      className: "fx-round",
      points: [[LEFT + 11, TOP + 11]]
    });
    assertNear({
      actual: roundCorner ?? {
        r: 0,
        g: 0,
        b: 0
      },
      expected: {
        r: 255,
        g: 0,
        b: 0
      }
    });

    const [restored = null] = await colorsWith({
      className: "",
      points: [[MIDDLE_X, MIDDLE_Y]]
    });
    assertNear({
      actual: restored ?? {
        r: 0,
        g: 0,
        b: 0
      },
      expected: {
        r: 255,
        g: 255,
        b: 0
      }
    });
    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});
