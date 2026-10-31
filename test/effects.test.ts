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
const INPUT_CURSOR_HAND = 3;
const INPUT_CURSOR_NO = 11;
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

// The example's transitions run 3000 milliseconds: its card blurs in and its path draws in.
const EARLY_MILLISECONDS = 500;
const NEAR_THE_END_MILLISECONDS = 2500;
const PAST_THE_END_MILLISECONDS = 4200;
const CARD_BOUNDARY_X = 66;
const CARD_MIDDLE_Y = 46;
const WHITE = 255;
const PURE_SLACK = 8;
// The path runs 180 pixels across, then 60 down, at the bottom left of the stage:
// only a measured length of all 240 has drawn the way down this late.
const PATH_DOWN_X = 198;
const PATH_DOWN_Y = 290;
const PATH_COLOR = 255;

test("the blur transition blurs the element for real, and draw measures a path", {
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
    const cardPoints = [{
      x: CARD_BOUNDARY_X - 10,
      y: CARD_MIDDLE_Y
    }, {
      x: CARD_BOUNDARY_X + 10,
      y: CARD_MIDDLE_Y
    }];
    function read(points: typeof cardPoints) {
      return windowPixels({
        pid: example.pid,
        scale,
        origin: STAGE_COLOR,
        points
      });
    }
    await example.ask({
      command: {
        cmd: "card",
        show: true
      },
      kind: "card"
    });
    await wait(EARLY_MILLISECONDS);
    const [earlyWhite, earlyInk] = read(cardPoints);
    assert.ok(earlyWhite !== undefined && earlyWhite.g < WHITE - PURE_SLACK, `the white half is still sharp: ${JSON.stringify(earlyWhite)}`);
    assert.ok(earlyInk !== undefined && earlyInk.g > PURE_SLACK, `the black half is still sharp: ${JSON.stringify(earlyInk)}`);
    await wait(PAST_THE_END_MILLISECONDS);
    const [lateWhite, lateInk] = read(cardPoints);
    assert.ok(lateWhite !== undefined && lateWhite.g >= WHITE - PURE_SLACK, `the white half did not come into focus: ${JSON.stringify(lateWhite)}`);
    assert.ok(lateInk !== undefined && lateInk.g <= PURE_SLACK, `the black half did not come into focus: ${JSON.stringify(lateInk)}`);

    await example.ask({
      command: {
        cmd: "line",
        show: true
      },
      kind: "line"
    });
    await wait(NEAR_THE_END_MILLISECONDS);
    const [down] = read([{
      x: PATH_DOWN_X,
      y: PATH_DOWN_Y
    }]);
    assert.ok(down !== undefined && down.g >= PATH_COLOR - PURE_SLACK, `the path is not drawn down its second part: ${JSON.stringify(down)}`);
    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});

test("cursor sets the ProtectedCursor of the element, read back as the shape", {
  skip: !IS_AVAILABLE,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/effects/main.ts" });
  try {
    async function shapeWith(className: string) {
      await example.ask({
        command: {
          cmd: "set",
          class: className
        },
        kind: "set"
      });
      await wait(SETTLE_MILLISECONDS);
      const report = await example.ask({
        command: {
          cmd: "cursor"
        },
        kind: "cursor"
      });
      return report["shape"];
    }

    assert.equal(await shapeWith("fx-pointer"), INPUT_CURSOR_HAND, "cursor: pointer is the hand");
    assert.equal(await shapeWith("fx-forbidden"), INPUT_CURSOR_NO, "cursor: not-allowed is the universal no");
    assert.equal(await shapeWith(""), null, "without a cursor rule the element has none of its own");
    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});
