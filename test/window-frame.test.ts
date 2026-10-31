import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The window frame example (examples/window-frame) in a real WinUI window, off
// screen and never activated. Skipped where the Windows App SDK was not
// restored.

const TIMEOUT_MILLISECONDS = 300_000;
const ROWS_WITH_TITLE_BAR = 2;

test("a bare Window with a title bar opens with no control registered by hand", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/window-frame/main.ts" });
  try {
    const opened = await example.ask({
      command: {
        cmd: "info"
      },
      kind: "info"
    });
    assert.equal(opened["isOpen"], true);
    assert.equal(
      numberOf({
        report: opened,
        field: "rowCount"
      }), ROWS_WITH_TITLE_BAR, "the title bar row and the content row"
    );

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0, "closing the window ends the example");
  } finally {
    example.kill();
  }
});
