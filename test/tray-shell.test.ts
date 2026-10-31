import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The part of the tray that needs the user's shell: the notification area
// belongs to the shell on the default desktop, so this file runs there
// (DEFAULT_DESKTOP_TESTS in scripts/test-windows.ts) and does only what the
// shell has to answer: the shell accepts the icon, draws it with a size, and
// forgets it when it is hidden or removed, and the taskbar drops the window's
// button while it is hidden to the tray. It sends no input (the icon is found
// by asking the shell where it drew it, Shell_NotifyIconGetRect), never
// touches the taskbar, opens no menu, and ends the example through its own
// close, so the example's exit hook removes the icon even when an assertion
// failed. The rest of the tray runs hidden in tray.test.ts. Skipped where the
// Windows App SDK was not restored, and after the first check where the
// session has no notification area.

const TIMEOUT_MILLISECONDS = 300_000;
const ICON_WIDTH_MINIMUM = 8;

test("the shell accepts a tray icon, draws it, and forgets it when hidden or removed", {
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
    assert.equal(await example.stop(), true, "the example left through its own close");
  } finally {
    await example.stop();
  }
});
