import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The web-bridge example (examples/web-bridge) in a real WinUI window, off
// screen and never activated: a WebView2 hosts a page that greets the app and
// answers the app's request through winui-svelte/messaging, both ways over
// PostWebMessageAsJson. It stays on the default desktop
// (scripts/test-windows.ts), where the browser can start; it needs an ordinary
// desktop session, since in a process that a sandbox or a service started the
// browser cannot be launched and WebView2 reports 0x8007139F. Skipped where the
// Windows App SDK or the WebView2 library was not restored (pnpm restore), or
// the WebView2 Runtime is not installed. It has a profile folder of its own.

const TIMEOUT_MILLISECONDS = 300_000;
const POLL_MILLISECONDS = 500;
const NATIVE_LIBRARY = path.join(import.meta.dirname, "..", ".winapp", "bin", process.arch, "Microsoft.Web.WebView2.Core.dll");
const RUNTIME_KEY = String.raw`HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`;

function isWebViewRuntimeInstalled() {
  try {
    execFileSync("reg", ["query", RUNTIME_KEY], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("the page and the app answer each other through the WebView2 bridge", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED || !existsSync(NATIVE_LIBRARY) || !isWebViewRuntimeInstalled(),
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  // One profile folder per run: two browsers on one folder (a second run, an
  // app of the same name) answer 0x800700AA (ERROR_BUSY)
  const userDataFolder = mkdtempSync(path.join(tmpdir(), "winui-svelte-web-bridge-"));
  const example = ExampleProcess.start({
    entry: "examples/web-bridge/main.ts",
    env: {
      WEBVIEW2_USER_DATA_FOLDER: userDataFolder
    }
  });
  try {
    const deadline = Date.now() + TIMEOUT_MILLISECONDS / 2;
    let status = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    while (status["pageTitle"] === "" && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
      status = await example.ask({
        command: {
          cmd: "stats"
        },
        kind: "stats"
      });
    }

    assert.equal(status["initializationResult"], 0);
    assert.equal(status["greeting"], "page");
    assert.equal(status["pageTitle"], "Hosted page");
    // The window's close is the end of the test, not the process's exit: on a
    // desktop of its own the worker thread that ran a WebView2 window does not
    // finish (the process lingers after the browser is gone), so the finally
    // below ends it
    const closed = await example.ask({
      command: {
        cmd: "close"
      },
      kind: "closed"
    });
    assert.equal(closed["kind"], "closed");
  } finally {
    example.kill();
    rmSync(userDataFolder, {
      force: true,
      maxRetries: 5,
      recursive: true
    });
  }
});
