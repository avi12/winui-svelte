import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

// The tray menu editor (examples/tray-menu-editor) in a real WinUI window, off
// screen: the audit reads its controls through UI Automation (every one has a
// name), and a change made from code reaches the bound profile and the file
// the app saves. It sends no key and no mouse.

const TIMEOUT_MILLISECONDS = 300_000;
const SETTLE_MILLISECONDS = 1500;

describe("tray menu editor", { skip: !IS_WINDOWS_APP_SDK_RESTORED }, () => {
  let example: ExampleProcess;

  before(async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "tray-menu-editor-")), "tray-menu.json");
    example = ExampleProcess.start({
      entry: "examples/tray-menu-editor/main.ts",
      flags: ["--file", file]
    });
    await new Promise(resolve => setTimeout(resolve, SETTLE_MILLISECONDS));
  }, { timeout: TIMEOUT_MILLISECONDS });

  after(() => {
    example.kill();
  });

  test("the editor renders with every control named, at the simple level", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const report = await example.ask({
      command: {
        cmd: "info"
      },
      kind: "info"
    });
    assert.deepEqual(report["findings"], []);
    assert.deepEqual(report["profile"], {
      level: "simple",
      hidden: [],
      shown: [],
      order: {}
    });
  });

  test("a change made to the bound profile from code is what the window and the saved file hold", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const full = await example.ask({
      command: {
        cmd: "level",
        level: "full"
      },
      kind: "info"
    });
    assert.deepEqual(full["findings"], []);
    assert.deepEqual(full["profile"], {
      level: "full",
      hidden: [],
      shown: [],
      order: {}
    });
    const hidden = await example.ask({
      command: {
        cmd: "hide",
        id: "tool-ruler"
      },
      kind: "info"
    });
    assert.deepEqual(hidden["findings"], []);
    assert.equal(typeof hidden["saved"], "string");
    assert.deepEqual(JSON.parse(String(hidden["saved"])), {
      level: "full",
      hidden: ["tool-ruler"],
      shown: [],
      order: {}
    });
  });
});
