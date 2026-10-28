import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

// The web example (examples/web) in a real WinUI window, off screen and never
// activated: a WebView2 starts its browser, loads a page and says so through
// its events. Skipped where the Windows App SDK was not restored or the
// WebView2 Runtime is not installed.

const TIMEOUT_MILLISECONDS = 300_000;
const POLL_MILLISECONDS = 500;
const RUNTIME_KEY = String.raw`HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`;

function isWebViewRuntimeInstalled() {
  try {
    execFileSync("reg", ["query", RUNTIME_KEY], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("a WebView2 starts, loads its page and reports it", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED || !isWebViewRuntimeInstalled(),
  timeout: TIMEOUT_MILLISECONDS,
  // The control is bound and mounts (mount-all.test.ts), but under node.exe it
  // never gets as far as a browser. It needs Microsoft.Web.WebView2.Core.dll
  // and WebView2Loader.dll where the process finds them (0x8007007E without),
  // and then reports 0x8007139F (ERROR_INVALID_STATE) from its initialization
  // before any user data folder exists.
  todo: "WebView2 does not start its browser in a node.exe host: initialization fails with 0x8007139F"
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/web/main.ts" });
  try {
    const deadline = Date.now() + TIMEOUT_MILLISECONDS / 2;
    let status = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    while (status["isNavigated"] !== true && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
      status = await example.ask({
        command: {
          cmd: "stats"
        },
        kind: "stats"
      });
    }

    assert.equal(status["initializationResult"], 0);
    assert.equal(status["isNavigated"], true);
    assert.equal(status["isSuccess"], true);
    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});
