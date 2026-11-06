import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The taskbar example (examples/taskbar) in a real WinUI window, off screen
// and never activated, on a desktop of its own. Every command reaches the
// shell through ITaskbarList3 and FlashWindowEx; a failing HRESULT throws in
// the example and comes back as the report's error, so no error is the
// shell's own S_OK. The shell offers no way to read a progress bar or an
// overlay back, so that is all Windows can be asked. It sends no input and is
// driven only by the example's own commands. Skipped where the Windows App SDK
// was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const HALF = 0.5;
const UNREAD = 7;
const FLASHES = 2;

test("the taskbar button takes progress, an overlay, a badge fallback and a flash", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/taskbar/main.ts" });
  try {
    for (const state of ["normal", "indeterminate", "error", "paused", "none"]) {
      const report = await example.ask({
        command: {
          cmd: "progress",
          state,
          value: HALF
        },
        kind: "done"
      });
      assert.equal(report["error"], null);
      assert.equal(report["state"], state);
    }

    for (const command of [
      {
        cmd: "overlay",
        count: UNREAD
      },
      {
        cmd: "clearOverlay"
      },
      {
        cmd: "badge",
        count: UNREAD
      },
      {
        cmd: "badge",
        count: 0
      },
      {
        cmd: "flash",
        count: FLASHES
      },
      {
        cmd: "stopFlashing"
      }
    ]) {
      const report = await example.ask({
        command,
        kind: "done"
      });
      assert.equal(report["error"], null, `${String(command.cmd)} failed`);
    }
  } finally {
    await example.stop();
  }
});
