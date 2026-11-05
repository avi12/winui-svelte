import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The refused toggle example (examples/refused-toggle) in a real WinUI window,
// off screen and never activated: a ToggleSwitch and a CheckBox whose bound
// prop the app never lets change. The test sets the control's own property,
// which raises the same event a user's click does; the control must show what
// the app holds once the app has been told. Skipped where the Windows App SDK
// was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const LAYOUT_MILLISECONDS = 1000;
const SETTLE_MILLISECONDS = 500;

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

test("a switch and a check box the app refuses go back to what the app holds", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/refused-toggle/main.ts" });
  try {
    await wait(LAYOUT_MILLISECONDS);
    await example.ask({
      command: {
        cmd: "flip"
      },
      kind: "flipped"
    });
    await wait(SETTLE_MILLISECONDS);
    const report = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.equal(report["switchAsked"], 1, "the app was told of the switch");
    assert.equal(report["checkAsked"], 1, "the app was told of the check box");
    assert.equal(report["isSwitchOn"], false, "the switch shows what the app holds");
    assert.equal(report["isChecked"], false, "the check box shows what the app holds");
  } finally {
    await example.stop();
  }
});
