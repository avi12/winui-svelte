import type { Report } from "./example-process.ts";
import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import type { Json } from "#src/messaging/json.js";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

// The window frame example (examples/window-frame) in a real WinUI window, off
// screen and never activated. Skipped where the Windows App SDK was not
// restored.

const TIMEOUT_MILLISECONDS = 300_000;
const ROWS_WITH_TITLE_BAR = 2;
const CORNER_RADIUS = 12;
const HOST_GONE_MILLISECONDS = 30_000;
const LAYOUT_MILLISECONDS = 900;
const DOCK_INSET = 6;
const GROWN_LINES = 8;
const MOVE_BY = 40;

function recordOf(value: Json | undefined) {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value), "the report carries a record");
  return value;
}

function boundsOf(report: Report) {
  const bounds = recordOf(report["bounds"]);
  return {
    x: numberOf({
      report: bounds,
      field: "x"
    }),
    y: numberOf({
      report: bounds,
      field: "y"
    }),
    width: numberOf({
      report: bounds,
      field: "width"
    }),
    height: numberOf({
      report: bounds,
      field: "height"
    })
  };
}

// The window after the layout pass that follows a command has resized it.
async function settledInfo(example: ExampleProcess) {
  await new Promise(resolve => setTimeout(resolve, LAYOUT_MILLISECONDS));
  return example.ask({
    command: {
      cmd: "info"
    },
    kind: "info"
  });
}

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
    const elementHeight = numberOf({
      report: opened,
      field: "elementHeight"
    });
    const desiredHeight = numberOf({
      report: opened,
      field: "desiredHeight"
    });
    assert.ok(desiredHeight > 0, "the content asks for a height");
    assert.ok(desiredHeight < elementHeight, "a stretched element is as tall as its space; desiredHeight is what its content asks for");
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
    assert.equal(shaped["isTopmostStyle"], true, "isAlwaysOnTop set while the window was hidden still gives it the topmost style once shown");
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

test("a window follows its content's height with its bottom-right corner pinned", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/window-frame/main.ts" });
  try {
    const noActivate = await example.ask({
      command: {
        cmd: "frame",
        isActivatable: false
      },
      kind: "frame"
    });
    assert.equal(noActivate["isNoActivate"], true);

    await example.ask({
      command: {
        cmd: "frame",
        sizeToContent: "height",
        anchor: "bottomRight",
        isBorderless: true
      },
      kind: "frame"
    });
    await example.ask({
      command: {
        cmd: "dock",
        anchor: "bottomRight",
        inset: DOCK_INSET
      },
      kind: "docked"
    });
    const before = boundsOf(await settledInfo(example));
    await example.ask({
      command: {
        cmd: "grow",
        lines: GROWN_LINES
      },
      kind: "grown"
    });
    const grown = boundsOf(await settledInfo(example));
    assert.ok(grown.height > before.height, "more content makes the window taller");
    assert.equal(grown.width, before.width, "height mode keeps the width");
    assert.equal(grown.x + grown.width, before.x + before.width, "the right edge stays");
    assert.equal(grown.y + grown.height, before.y + before.height, "the bottom edge stays: the window grew upward");

    await example.ask({
      command: {
        cmd: "grow",
        lines: 0
      },
      kind: "grown"
    });
    const shrunk = boundsOf(await settledInfo(example));
    assert.equal(shrunk.height, before.height, "less content shrinks it back");
    assert.equal(shrunk.y + shrunk.height, before.y + before.height);

    const moved = await example.ask({
      command: {
        cmd: "move",
        x: -MOVE_BY,
        y: 0
      },
      kind: "moved"
    });
    const geometry = recordOf(moved["geometry"]);
    assert.equal(
      Math.round(
        boundsOf(moved).x / numberOf({
          report: geometry,
          field: "devicePixelRatio"
        })
      ),
      geometry["screenX"],
      "screenX is the left edge in CSS pixels"
    );

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0, "closing the window ends the example");
  } finally {
    example.kill();
  }
});

// A covering window is seen on the real desktop, so this test runs only when
// asked for: WINUI_SVELTE_COVER_TEST=1.
const IS_COVER_TEST_WANTED = process.env["WINUI_SVELTE_COVER_TEST"] === "1";
const RESIZE_FRAME = 8;
const REGION = {
  x: 240,
  y: 120,
  width: 800,
  height: 600
};

async function covered({ example, region }: {
  example: ExampleProcess;
  region?: typeof REGION;
}) {
  const report = await example.ask({
    command: region === undefined ? { cmd: "cover" } : {
      cmd: "cover",
      region: true,
      ...region
    },
    kind: "covered"
  });
  return {
    bounds: boundsOf(report),
    target: recordOf(report["target"]),
    display: recordOf(report["displayBounds"]),
    client: recordOf(report["clientSize"])
  };
}

test("cover puts a borderless window exactly over the primary display, or a region of it", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED || !IS_COVER_TEST_WANTED && "set WINUI_SVELTE_COVER_TEST=1: the window covers the screen",
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/window-frame/main.ts" });
  try {
    await example.ask({
      command: {
        cmd: "frame",
        isBorderless: true,
        isResizable: false,
        isActivatable: false,
        isToolWindow: true
      },
      kind: "frame"
    });
    const whole = await covered({ example });
    assert.deepEqual(whole.bounds, whole.display, "the window is exactly the display");
    assert.deepEqual(whole.target, whole.display, "cover returns the bounds it applied");

    const part = await covered({
      example,
      region: REGION
    });
    assert.deepEqual(part.bounds, {
      x: Number(part.display["x"]) + REGION.x,
      y: Number(part.display["y"]) + REGION.y,
      width: REGION.width,
      height: REGION.height
    }, "the region is placed from the display's top left, in physical pixels");

    await example.ask({
      command: {
        cmd: "frame",
        isBorderless: true,
        isResizable: true,
        isActivatable: false,
        isToolWindow: true
      },
      kind: "frame"
    });
    const resizable = await covered({ example });
    const gap = resizable.bounds.width - Number(resizable.client["width"]);
    assert.ok(gap > 0 && gap <= 2 * RESIZE_FRAME, "without isResizable={false} the resize frame shrinks the client area");

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});

test("cover places a hidden window before it first shows, and oncovered fires once it is visible", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED || !IS_COVER_TEST_WANTED && "set WINUI_SVELTE_COVER_TEST=1: the window covers the screen",
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({
    entry: "examples/window-frame/main.ts",
    flags: ["--hidden", "true"],
    env: FOREGROUND
  });
  try {
    const covering = {
      cmd: "frame",
      isBorderless: true,
      isResizable: false,
      isActivatable: false,
      isToolWindow: true,
      cover: true
    };
    const hidden = await example.ask({
      command: {
        ...covering,
        isHidden: true
      },
      kind: "frame"
    });
    assert.equal(hidden["isVisible"], false);
    assert.equal(hidden["coveredCount"], 0, "oncovered waits for the window to be visible");

    const shown = await example.ask({
      command: {
        ...covering,
        isHidden: false
      },
      kind: "frame"
    });
    const whole = await covered({ example });
    assert.equal(shown["isVisible"], true);
    assert.equal(shown["coveredCount"], 1, "oncovered fires once, when the window shows");
    assert.deepEqual(shown["coveredBounds"], whole.display, "the window was placed over the display");

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});

test("a window process ends when the host process that started it is gone", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const host = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  const example = ExampleProcess.start({
    entry: "examples/window-frame/main.ts",
    flags: ["--host-process", String(host.pid)]
  });
  try {
    const opened = await example.ask({
      command: {
        cmd: "info"
      },
      kind: "info"
    });
    assert.equal(opened["isOpen"], true);

    host.kill();
    const left = await Promise.race([
      example.exited,
      new Promise<string>(resolve => setTimeout(() => resolve("still running"), HOST_GONE_MILLISECONDS))
    ]);
    assert.equal(left, 0, "the window process exits by itself, with no command and no input closing");
  } finally {
    host.kill();
    example.kill();
  }
});
