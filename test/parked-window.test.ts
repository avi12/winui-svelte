import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import { screenAreas } from "./window-pixels.ts";
import { foregroundWindowHandle } from "#src/window/native.js";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The parked-window example (examples/parked-window): a window shown and never
// seen (isParked) hosts a page whose heartbeat, visibility and frames the app
// reads; the same window with isHidden is the control that proves the test can
// tell a hidden page from a parked one. Not a background run (WINUI_SVELTE_BACKGROUND
// is cleared), so that isParked alone does the work. Nothing is activated and no
// input is sent. Needs an ordinary desktop session for the browser; skipped where
// the Windows App SDK, the WebView2 library or the Runtime is missing.

const TIMEOUT_MILLISECONDS = 300_000;
const POLL_MILLISECONDS = 500;
const MEASURE_MILLISECONDS = 5000;
const MAXIMUM_AVERAGE_GAP = 150;
const MINIMUM_FRAMES_PER_SECOND = 10;
const NATIVE_LIBRARY = path.join(import.meta.dirname, "..", ".winapp", "bin", process.arch, "Microsoft.Web.WebView2.Core.dll");
const RUNTIME_KEY = String.raw`HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`;
const NOT_BACKGROUND = { WINUI_SVELTE_BACKGROUND: "0" };

function isWebViewRuntimeInstalled() {
  try {
    execFileSync("reg", ["query", RUNTIME_KEY], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const IS_SKIPPED = !IS_WINDOWS_APP_SDK_RESTORED || !existsSync(NATIVE_LIBRARY) || !isWebViewRuntimeInstalled();

async function measured({ isHidden }: { isHidden: boolean }) {
  const userDataFolder = mkdtempSync(path.join(tmpdir(), "winui-svelte-parked-"));
  const example = ExampleProcess.start({
    entry: "examples/parked-window/main.ts",
    flags: ["--hidden", String(isHidden)],
    env: {
      ...NOT_BACKGROUND,
      WEBVIEW2_USER_DATA_FOLDER: userDataFolder
    }
  });
  try {
    const foregroundBefore = foregroundWindowHandle();
    const deadline = Date.now() + TIMEOUT_MILLISECONDS / 2;
    let stats = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    while (numberOf({
      report: stats,
      field: "beatCount"
    }) === 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
      stats = await example.ask({
        command: {
          cmd: "stats"
        },
        kind: "stats"
      });
    }

    await example.ask({
      command: {
        cmd: "reset"
      },
      kind: "reset"
    });
    await new Promise(resolve => setTimeout(resolve, MEASURE_MILLISECONDS));
    const result = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.equal(foregroundWindowHandle(), foregroundBefore, "opening the window never takes the foreground");
    return result;
  } finally {
    example.kill();
    rmSync(userDataFolder, {
      force: true,
      maxRetries: 5,
      recursive: true
    });
  }
}

test("a parked window is shown, off every display, and its page runs at full speed", {
  skip: IS_SKIPPED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const result = await measured({ isHidden: false });
  const bounds = result["bounds"];
  assert.ok(bounds !== null && typeof bounds === "object" && !Array.isArray(bounds));
  const window = {
    x: Number(bounds["x"]),
    y: Number(bounds["y"]),
    width: Number(bounds["width"]),
    height: Number(bounds["height"])
  };
  for (const area of screenAreas()) {
    const isOverlapping = window.x < area.x + area.width && window.x + window.width > area.x
      && window.y < area.y + area.height && window.y + window.height > area.y;
    assert.equal(isOverlapping, false, "the window is clear of every display");
  }

  assert.equal(result["isVisible"], true, "a parked window is shown");
  assert.equal(result["isToolWindow"], true, "no taskbar button, no Alt+Tab entry");
  assert.equal(result["isNoActivate"], true, "it is never activated");
  assert.equal(result["visibility"], "visible");
  assert.ok(
    numberOf({
      report: result,
      field: "averageGap"
    }) < MAXIMUM_AVERAGE_GAP, "the heartbeat keeps its pace"
  );
  assert.ok(
    numberOf({
      report: result,
      field: "framesPerSecond"
    }) > MINIMUM_FRAMES_PER_SECOND, "requestAnimationFrame keeps firing"
  );
});

test("a hidden window reports a hidden page (the control)", {
  skip: IS_SKIPPED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const result = await measured({ isHidden: true });
  assert.equal(result["visibility"], "hidden");
  assert.ok(
    numberOf({
      report: result,
      field: "beatCount"
    }) > 0
  );
});
