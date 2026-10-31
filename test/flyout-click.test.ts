import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import { act } from "./uia.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The flyout-click example (examples/flyout-click) in a real WinUI window on
// the test desktop: a button whose onclick sets `open` while WinUI opens the
// button's own flyout in the same click. The flyout must stay open, in a
// normal window, one that is never activated and one that is always on top.
// Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const SETTLE_MILLISECONDS = 2500;

const VIEWS = [
  {
    name: "a normal window",
    view: "normal"
  },
  {
    name: "a window that is never activated",
    view: "inactive"
  },
  {
    name: "an always on top window",
    view: "top"
  }
];

function stats(example: ExampleProcess) {
  return example.ask({
    command: {
      cmd: "stats"
    },
    kind: "stats"
  });
}

async function press({ example, id }: {
  example: ExampleProcess;
  id: string;
}) {
  act({
    pid: example.pid,
    id,
    action: "invoke"
  });
  await new Promise(resolve => setTimeout(resolve, SETTLE_MILLISECONDS));
  return stats(example);
}

for (const { name, view } of VIEWS) {
  test(`a flyout opened by its button's click, and by the button itself, stays open in ${name}`, {
    skip: !IS_WINDOWS_APP_SDK_RESTORED,
    timeout: TIMEOUT_MILLISECONDS
  }, async () => {
    const example = ExampleProcess.start({
      entry: "examples/flyout-click/main.ts",
      flags: ["--view", view]
    });
    try {
      await stats(example);

      const clicked = await press({
        example,
        id: "clicked"
      });
      assert.equal(clicked["clickedOpen"], true, "open fell back to false: the flyout closed at once");
      assert.equal(clicked["clickedShown"], 1);
      assert.equal(clicked["closed"], "{}", "the flyout was closed after it opened");

      const native = await press({
        example,
        id: "native"
      });
      assert.equal(native["nativeOpen"], true);
      assert.equal(native["nativeShown"], 1);
    } finally {
      example.kill();
    }
  });
}
