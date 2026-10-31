import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The tray example (examples/tray) in a real WinUI window, off screen and
// never activated, on a desktop of its own: there is no notification area
// there, so the shell refuses the icon (Shell_NotifyIcon fails, which the tray
// must survive), and what is left is everything that does not need the shell:
// the props, the balloon call, the menu and its flyout, removing the icon, and the example's leaving. What the
// shell itself answers is tray-shell.test.ts, on the default desktop. It sends
// no input and is driven only by the example's own commands. Tests must never
// inject real input (mouse, keyboard, clicks on the taskbar) into the user's
// desktop. Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const WAIT_MILLISECONDS = 20_000;
const POLL_MILLISECONDS = 300;

async function untilFlyout({ example, isOpen }: {
  example: ExampleProcess;
  isOpen: boolean;
}) {
  const deadline = Date.now() + WAIT_MILLISECONDS;
  for (;;) {
    const report = await example.ask({
      command: {
        cmd: "info"
      },
      kind: "info"
    });
    const isMet = report["isFlyoutOpen"] === isOpen;
    const isLate = Date.now() > deadline;
    const isDone = isMet || isLate;
    if (isDone) {
      return report;
    }

    await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
  }
}

test("the tray follows its props, opens its menu and leaves, with or without a shell", {
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
    assert.equal(opened["kind"], "info", "the example started although the shell refused the icon");
    const retitled = await example.ask({
      command: {
        cmd: "tooltip",
        value: "Changed"
      },
      kind: "tooltip"
    });
    assert.equal(retitled["tooltip"], "Changed");
    const ballooned = await example.ask({
      command: {
        cmd: "balloon"
      },
      kind: "balloon"
    });
    assert.equal(ballooned["kind"], "balloon", "a balloon the shell cannot show does not throw");
    const menuPoint = {
      x: 400,
      y: 300
    };
    const menuOpened = await example.ask({
      command: {
        cmd: "menuOpen",
        ...menuPoint
      },
      kind: "menuOpen"
    });
    assert.equal(menuOpened["isMenuOpen"], true);
    const menuShown = await untilFlyout({
      example,
      isOpen: true
    });
    assert.equal(menuShown["isFlyoutOpen"], true, "the menu's flyout opened from the one-pixel window");
    const menuClosed = await example.ask({
      command: {
        cmd: "menuClose"
      },
      kind: "menuClose"
    });
    assert.equal(menuClosed["isMenuOpen"], false);
    const flyoutGone = await untilFlyout({
      example,
      isOpen: false
    });
    assert.equal(flyoutGone["isFlyoutOpen"], false, "closing the menu closes its flyout and window");
    const removed = await example.ask({
      command: {
        cmd: "remove"
      },
      kind: "remove"
    });
    assert.equal(removed["hasBounds"], false, "removed, the icon has no place in the shell");
    assert.equal(await example.stop(), true, "the example left through its own close");
  } finally {
    await example.stop();
  }
});
