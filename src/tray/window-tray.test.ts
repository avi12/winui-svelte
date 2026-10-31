import { hideToTray, restoreFromTray, toggleInTray } from "./window-tray.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

function fakeWindow() {
  const calls: string[] = [];
  const window = {
    appWindow: {
      isVisible: true,
      hide() {
        calls.push("hide");
        window.appWindow.isVisible = false;
      },
      show() {
        calls.push("show");
        window.appWindow.isVisible = true;
      }
    },
    isShownInSwitchers: true,
    setShownInSwitchers(isShown: boolean) {
      window.isShownInSwitchers = isShown;
    },
    bringToFront() {
      calls.push("bringToFront");
    }
  };
  return {
    window,
    calls
  };
}

test("hideToTray hides the window and its taskbar button, restoreFromTray undoes both", () => {
  const { window, calls } = fakeWindow();
  hideToTray(window);
  assert.equal(window.appWindow.isVisible, false);
  assert.equal(window.isShownInSwitchers, false);
  restoreFromTray(window);
  assert.equal(window.appWindow.isVisible, true);
  assert.equal(window.isShownInSwitchers, true);
  assert.deepEqual(calls, ["hide", "show", "bringToFront"]);
});

test("toggleInTray hides a visible window and restores a hidden one", () => {
  const { window } = fakeWindow();
  toggleInTray(window);
  assert.equal(window.appWindow.isVisible, false);
  toggleInTray(window);
  assert.equal(window.appWindow.isVisible, true);
});
