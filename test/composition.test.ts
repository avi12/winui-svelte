import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import { windowPixels } from "./window-pixels.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The Composition example (examples/composition) in a real WinUI window, off
// screen and never activated. The spring card's target is moved by a command
// (no input is sent); once the spring settles, the red card has travelled the
// whole way and the yellow one, whose translation is an expression of half the
// red card's, half of it. The compositor runs both on its own thread, so they
// are read back from what Windows draws.

const TIMEOUT_MILLISECONDS = 300_000;
const ORIGIN_COLOR = "336699";
const SETTLE_MILLISECONDS = 2000;
const CHANNEL_SLACK = 24;
const LEADER = {
  x: 60,
  y: 60
};
const FOLLOWER = {
  x: 60,
  y: 180
};
const TRAVEL = 240;
const RED = {
  r: 0xff,
  g: 0x00,
  b: 0x00
};
const YELLOW = {
  r: 0xf2,
  g: 0xc1,
  b: 0x4e
};
const STAGE = {
  r: 0x33,
  g: 0x66,
  b: 0x99
};

interface Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function isNear({ pixel, expected }: {
  pixel: Color | undefined;
  expected: Color;
}) {
  const channels = [[pixel?.r, expected.r], [pixel?.g, expected.g], [pixel?.b, expected.b]] as const;
  return channels.every(([actual, wanted]) => Math.abs((actual ?? -1) - wanted) <= CHANNEL_SLACK);
}

test("a spring moves a card on the compositor and an expression moves a second card half as far", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/composition/main.ts" });
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
    await example.ask({
      command: {
        cmd: "move",
        x: TRAVEL,
        y: 0
      },
      kind: "move"
    });
    await wait(SETTLE_MILLISECONDS);
    const [leaderMoved, leaderLeft, followerMoved, followerLeft] = windowPixels({
      pid: example.pid,
      scale,
      origin: ORIGIN_COLOR,
      points: [{
        x: LEADER.x + TRAVEL,
        y: LEADER.y
      }, LEADER, {
        x: FOLLOWER.x + TRAVEL / 2,
        y: FOLLOWER.y
      }, FOLLOWER]
    });
    assert.ok(
      isNear({
        pixel: leaderMoved,
        expected: RED
      }), `the spring card is not where the spring came to rest: ${JSON.stringify(leaderMoved)}`
    );
    assert.ok(
      isNear({
        pixel: leaderLeft,
        expected: STAGE
      }), `the spring card is still where it started: ${JSON.stringify(leaderLeft)}`
    );
    assert.ok(
      isNear({
        pixel: followerMoved,
        expected: YELLOW
      }), `the following card is not half way: ${JSON.stringify(followerMoved)}`
    );
    assert.ok(
      isNear({
        pixel: followerLeft,
        expected: STAGE
      }), `the following card did not move: ${JSON.stringify(followerLeft)}`
    );
  } finally {
    await example.stop();
  }
});
