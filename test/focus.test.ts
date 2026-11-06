import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// activeElement, moveFocus and trapFocus in the keys example (examples/keys),
// driven by commands that call the control APIs (Focus, FocusManager): no key
// or pointer input is sent. Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const SETTLE_MILLISECONDS = 400;
const KEYBOARD_NAVIGATION_CYCLE = 1;

function pause(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function activeNameOf(example: ExampleProcess) {
  const state = await example.ask({
    command: {
      cmd: "state"
    },
    kind: "state"
  });
  return String(state["activeName"]);
}

async function trapNavigationOf(example: ExampleProcess) {
  const state = await example.ask({
    command: {
      cmd: "state"
    },
    kind: "state"
  });
  return Number(state["trapNavigation"]);
}

async function move({ example, direction }: {
  example: ExampleProcess;
  direction: string;
}) {
  const report = await example.ask({
    command: {
      cmd: "moveFocus",
      direction
    },
    kind: "moved"
  });
  await pause(SETTLE_MILLISECONDS);
  return report["isMoved"] === true;
}

async function trap({ example, isOn }: {
  example: ExampleProcess;
  isOn: boolean;
}) {
  example.send({
    cmd: "trap",
    isOn
  });
  await pause(SETTLE_MILLISECONDS);
}

test("activeElement follows focus, moveFocus steps to a neighbour, trapFocus keeps focus inside and gives it back", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async context => {
  const example = ExampleProcess.start({ entry: "examples/keys/main.ts" });
  try {
    await activeNameOf(example);
    example.send({ cmd: "activate" });
    await pause(SETTLE_MILLISECONDS);
    example.send({
      cmd: "focus",
      id: "first"
    });
    await pause(SETTLE_MILLISECONDS);

    await context.test("activeElement reads the control that took focus", async () => {
      assert.equal(await activeNameOf(example), "first");
    });

    await context.test("moveFocus Down and Up step to the neighbour", async () => {
      assert.equal(
        await move({
          example,
          direction: "down"
        }), true
      );
      assert.equal(await activeNameOf(example), "input");
      assert.equal(
        await move({
          example,
          direction: "up"
        }), true
      );
      assert.equal(await activeNameOf(example), "first");
    });

    await context.test("trapFocus moves focus in, sets Cycle and restores focus when it ends", async () => {
      await trap({
        example,
        isOn: true
      });
      assert.equal(await activeNameOf(example), "trap-a");
      assert.equal(await trapNavigationOf(example), KEYBOARD_NAVIGATION_CYCLE);
      await move({
        example,
        direction: "down"
      });
      assert.equal(await activeNameOf(example), "trap-b");
      await trap({
        example,
        isOn: false
      });
      assert.equal(await activeNameOf(example), "first");
    });
  } finally {
    await example.stop();
  }
});
