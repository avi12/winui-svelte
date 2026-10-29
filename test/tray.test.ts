import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The tray example (examples/tray) in a real WinUI window, off screen and
// never activated. It sends no input to the desktop: the icon is checked by
// asking the shell where it drew it (Shell_NotifyIconGetRect), and the example
// is driven only by its own commands. Tests must never inject real input
// (mouse, keyboard, clicks on the taskbar) into the user's desktop. Skipped
// where the Windows App SDK was not restored, and for the shell part where the
// session has no notification area.

const TIMEOUT_MILLISECONDS = 300_000;
const ICON_WIDTH_MINIMUM = 8;

test("a tray icon is added, follows its props, and leaves nothing behind", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/tray/main.ts" });
  try {
    const opened = await example.ask({
      command: {
        cmd: "info"
      },
      kind: "info"
    });
    assert.equal(opened["isRegistered"], true, "the shell accepted the icon");
    const hasNotificationArea = opened["hasBounds"] === true;
    if (!hasNotificationArea) {
      return;
    }

    assert.ok(Number(opened["width"]) >= ICON_WIDTH_MINIMUM, "the shell drew the icon with a size");
    const hidden = await example.ask({
      command: {
        cmd: "visible",
        value: false
      },
      kind: "visible"
    });
    assert.equal(hidden["hasBounds"], false, "a hidden icon is gone from the shell");
    const shown = await example.ask({
      command: {
        cmd: "visible",
        value: true
      },
      kind: "visible"
    });
    assert.equal(shown["hasBounds"], true, "shown again, it is back");
    const retitled = await example.ask({
      command: {
        cmd: "tooltip",
        value: "Changed"
      },
      kind: "tooltip"
    });
    assert.equal(retitled["tooltip"], "Changed");
    assert.equal(retitled["hasBounds"], true);
    const ballooned = await example.ask({
      command: {
        cmd: "balloon"
      },
      kind: "balloon"
    });
    assert.equal(ballooned["hasBounds"], true, "a balloon leaves the icon in place");
    const hiddenToTray = await example.ask({
      command: {
        cmd: "hideToTray"
      },
      kind: "hideToTray"
    });
    assert.equal(hiddenToTray["isWindowVisible"], false);
    assert.equal(hiddenToTray["isShownInSwitchers"], false, "no taskbar button while hidden to the tray");
    const restored = await example.ask({
      command: {
        cmd: "restore"
      },
      kind: "restore"
    });
    assert.equal(restored["isWindowVisible"], true);
    assert.equal(restored["isShownInSwitchers"], true);
    const removed = await example.ask({
      command: {
        cmd: "remove"
      },
      kind: "remove"
    });
    assert.equal(removed["hasBounds"], false, "removed, the icon is gone from the shell");
  } finally {
    example.kill();
  }
});
