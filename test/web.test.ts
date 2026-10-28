import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// The web example (examples/web) in a real WinUI window, off screen and never
// activated: a WebView2 starts its browser, loads a page and says so through
// its events. Skipped where the Windows App SDK or the WebView2 library was not
// restored (pnpm restore), or the WebView2 Runtime is not installed. It needs an ordinary desktop session: in a
// process that a sandbox or a service started, the browser cannot be launched
// and WebView2 reports 0x8007139F.

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

test("a WebView2 starts, loads its page and reports it", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED || !existsSync(NATIVE_LIBRARY) || !isWebViewRuntimeInstalled(),
  timeout: TIMEOUT_MILLISECONDS
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
