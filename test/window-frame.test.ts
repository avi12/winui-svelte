import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The window frame example (examples/window-frame) in a real WinUI window, off
// screen and never activated. Skipped where the Windows App SDK was not
// restored.

const TIMEOUT_MILLISECONDS = 300_000;
const ROWS_WITH_TITLE_BAR = 2;
const CORNER_RADIUS = 12;

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

    await example.ask({
      command: {
        cmd: "trayOnClose",
        value: true
      },
      kind: "trayOnClose"
    });
    const hidden = await example.ask({
      command: {
        cmd: "tryClose"
      },
      kind: "closeTried"
    });
    assert.equal(hidden["isVisible"], false, "hideToTray inside onclosing hides a window that has no taskbar button, without throwing");
    const restored = await example.ask({
      command: {
        cmd: "restore"
      },
      kind: "restored"
    });
    assert.equal(restored["isVisible"], true, "restoreFromTray shows it again");
    await example.ask({
      command: {
        cmd: "trayOnClose",
        value: false
      },
      kind: "trayOnClose"
    });

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0, "closing the window ends the example");
  } finally {
    example.kill();
  }
});

// Not a background run: the background style bits would hide what the props
// set. The window is still off the user's desktop (the test desktop), and
// activate={false} keeps it from taking focus.
const FOREGROUND = { WINUI_SVELTE_BACKGROUND: "0" };

test("a window opens hidden, and the frame props set what Windows holds for it", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({
    entry: "examples/window-frame/main.ts",
    flags: ["--hidden", "true"],
    env: FOREGROUND
  });
  try {
    const opened = await example.ask({
      command: {
        cmd: "info"
      },
      kind: "info"
    });
    assert.equal(opened["isOpen"], true);
    assert.equal(opened["isVisible"], false, "isHidden opens the window without showing it");
    assert.equal(opened["hasBorder"], true, "a window with no frame prop has its frame");
    assert.equal(opened["isToolWindow"], false);
    assert.equal(opened["isNoActivate"], false);
    assert.equal(opened["isExcludedFromCapture"], false);
    assert.equal(opened["clipSize"], null);

    const shaped = await example.ask({
      command: {
        cmd: "frame",
        isBorderless: true,
        isActivatable: false,
        isToolWindow: true,
        isClickThrough: true,
        isExcludedFromCapture: true,
        isAlwaysOnTop: true,
        cornerRadius: CORNER_RADIUS,
        isHidden: false
      },
      kind: "frame"
    });
    assert.equal(shaped["isVisible"], true, "isHidden={false} shows the window");
    assert.equal(shaped["hasBorder"], false, "isBorderless takes the frame away");
    assert.equal(shaped["hasTitleBar"], false);
    assert.equal(shaped["isNoActivate"], true, "isActivatable={false} is the no-activate style");
    assert.equal(shaped["isToolWindow"], true, "isToolWindow is the tool window style, hidden from Alt+Tab");
    assert.equal(shaped["isTransparent"], true, "isClickThrough is the transparent style");
    assert.equal(shaped["isLayered"], true, "click-through needs a layered window");
    assert.equal(shaped["isExcludedFromCapture"], true);
    assert.equal(shaped["isAlwaysOnTop"], true);
    const clip = shaped["clipSize"];
    assert.ok(clip !== null && typeof clip === "object" && !Array.isArray(clip), "cornerRadius clips the window to a region");
    assert.ok(Number(clip["width"]) > 0 && Number(clip["height"]) > 0);

    const plain = await example.ask({
      command: {
        cmd: "frame"
      },
      kind: "frame"
    });
    assert.equal(plain["hasBorder"], true, "dropping isBorderless gives the frame back");
    assert.equal(plain["isNoActivate"], false);
    assert.equal(plain["isToolWindow"], false);
    assert.equal(plain["isTransparent"], false);
    assert.equal(plain["isExcludedFromCapture"], false);
    assert.equal(plain["isAlwaysOnTop"], false);
    assert.equal(plain["clipSize"], null, "dropping cornerRadius takes the clip away");

    const rehidden = await example.ask({
      command: {
        cmd: "frame",
        isHidden: true
      },
      kind: "frame"
    });
    assert.equal(rehidden["isVisible"], false, "isHidden={true} hides an open window");

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0, "closing the window ends the example");
  } finally {
    example.kill();
  }
});
