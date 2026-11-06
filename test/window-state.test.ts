import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import { parseWindowState, WindowRestoreState } from "#src/window/window-state.js";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The window example opened with a state key, three times in a row over a
// local data folder of its own (examples/window, Window `stateKey`): it
// reopens at the bounds it was moved and resized to, and a window that was
// maximized keeps its normal bounds in the file. Off screen and never
// activated, and no input is injected: the moves go through the AppWindow API.

const TIMEOUT_MILLISECONDS = 400_000;
const STATE_KEY = "main";
const MOVED_BY = 37;
const RESIZED_WIDTH = 640;
const RESIZED_HEIGHT = 410;
const FOLDER_PREFIX = "wa-window-state-test-";

function startExample(dataFolder: string) {
  return ExampleProcess.start({
    entry: "examples/window/main.ts",
    flags: ["--stateKey", STATE_KEY],
    env: {
      LOCALAPPDATA: dataFolder
    }
  });
}

function savedState(dataFolder: string) {
  const file = path.join(dataFolder, "node", "window-state", `${STATE_KEY}.json`);
  return parseWindowState(readFileSync(file, "utf8"));
}

test("a window with a state key reopens where it was, and keeps its normal bounds while maximized", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const dataFolder = mkdtempSync(path.join(tmpdir(), FOLDER_PREFIX));
  try {
    const first = startExample(dataFolder);
    let expected;
    try {
      const opened = await first.ask({
        command: {
          cmd: "info"
        },
        kind: "info"
      });
      await first.ask({
        command: {
          cmd: "move",
          x: numberOf({
            report: opened,
            field: "x"
          }) + MOVED_BY,
          y: numberOf({
            report: opened,
            field: "y"
          }) + MOVED_BY
        },
        kind: "moved"
      });
      await first.ask({
        command: {
          cmd: "resize",
          width: RESIZED_WIDTH,
          height: RESIZED_HEIGHT
        },
        kind: "resized"
      });
      expected = await first.ask({
        command: {
          cmd: "info"
        },
        kind: "info"
      });
      assert.equal(await first.stop(), true, "the first run ends by itself");
    } finally {
      first.kill();
    }

    const bounds = {
      x: numberOf({
        report: expected,
        field: "x"
      }),
      y: numberOf({
        report: expected,
        field: "y"
      }),
      width: RESIZED_WIDTH,
      height: RESIZED_HEIGHT
    };
    assert.deepEqual(savedState(dataFolder)?.bounds, bounds, "closing saves the bounds");

    const second = startExample(dataFolder);
    try {
      const reopened = await second.ask({
        command: {
          cmd: "info"
        },
        kind: "info"
      });
      assert.deepEqual({
        x: reopened["x"],
        y: reopened["y"],
        width: reopened["width"],
        height: reopened["height"]
      }, bounds, "the second run opens at the same bounds");
      const maximized = await second.ask({
        command: {
          cmd: "maximize"
        },
        kind: "maximized"
      });
      assert.equal(maximized["isMaximized"], true, "the window maximizes");
      assert.equal(await second.stop(), true, "the second run ends by itself");
    } finally {
      second.kill();
    }

    const saved = savedState(dataFolder);
    assert.equal(saved?.state, WindowRestoreState.maximized);
    assert.deepEqual(saved?.bounds, bounds, "a maximized window keeps its normal bounds");

    const third = startExample(dataFolder);
    try {
      const restored = await third.ask({
        command: {
          cmd: "info"
        },
        kind: "info"
      });
      assert.equal(restored["isMaximized"], true, "the third run opens maximized");
      assert.equal(await third.stop(), true, "the third run ends by itself");
    } finally {
      third.kill();
    }

    assert.deepEqual(savedState(dataFolder)?.bounds, bounds, "reopening maximized does not lose the normal bounds");
  } finally {
    rmSync(dataFolder, {
      recursive: true,
      force: true
    });
  }
});
