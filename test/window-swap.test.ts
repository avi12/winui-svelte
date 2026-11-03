import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// A <Window> component re-created twice (what a hot update of the component
// that owns it does): the process stays alive and one window is visible.
// Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const SWAPS = 2;

test("re-creating a window component keeps the process alive and one window visible", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/window-swap/main.ts" });
  try {
    for (let iSwap = 1; iSwap <= SWAPS; iSwap += 1) {
      const swapped = await example.ask({
        command: {
          cmd: "swap"
        },
        kind: "swapped"
      });
      assert.equal(swapped["generation"], iSwap);
      assert.equal(swapped["isVisible"], true, "the new window is the visible one");
    }

    assert.equal(await Promise.race([example.exited, Promise.resolve("alive")]), "alive", "the process survived");
  } finally {
    await example.stop();
  }
});
