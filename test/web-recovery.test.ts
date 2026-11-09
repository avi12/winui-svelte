import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import type { Report } from "./example-process.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The web-recovery example (examples/web-recovery) in a real WinUI window, off
// screen and never activated: a WebView2 whose page posts a message every
// second, kept alive by keepWebView2Alive. The test reads the browser's process
// id from the example, checks that its command line carries this run's own
// temporary profile folder (so it is the browser this test started and never
// another WebView2 or Edge), kills that pid and nothing else, and waits for the
// example to report a different browser process, the page's messages again and
// an answer to a ping. Same skips and the same desktop as
// test/web-bridge.test.ts.

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

function commandLineOf(processId: number) {
  return execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `(Get-CimInstance Win32_Process -Filter "ProcessId=${processId}").CommandLine`
  ], { encoding: "utf8" });
}

async function waitForStats({ example, isWanted }: {
  example: ExampleProcess;
  isWanted(status: Report): boolean;
}) {
  const deadline = Date.now() + TIMEOUT_MILLISECONDS / 3;
  let status = await example.ask({
    command: {
      cmd: "stats"
    },
    kind: "stats"
  });
  while (!isWanted(status) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
    status = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
  }

  assert.ok(isWanted(status), `condition not met: ${JSON.stringify(status)}`);
  return status;
}

test("killing the browser process brings the page back with a working bridge", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED || !existsSync(NATIVE_LIBRARY) || !isWebViewRuntimeInstalled(),
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const userDataFolder = mkdtempSync(path.join(tmpdir(), "winui-svelte-web-recovery-"));
  const example = ExampleProcess.start({
    entry: "examples/web-recovery/main.ts",
    env: {
      WEBVIEW2_USER_DATA_FOLDER: userDataFolder
    }
  });
  try {
    const before = await waitForStats({
      example,
      isWanted: status => status["state"] === "up" && Number(status["ticks"]) > 0
    });
    const oldProcessId = Number(before["browserProcessId"]);
    assert.ok(oldProcessId > 0);
    const commandLine = commandLineOf(oldProcessId).toLowerCase();
    assert.ok(commandLine.includes(userDataFolder.toLowerCase()), "the browser runs on this test's own profile folder");

    process.kill(oldProcessId);
    const after = await waitForStats({
      example,
      isWanted: status => status["state"] === "up"
        && Number(status["rebuilds"]) === 1
        && Number(status["browserProcessId"]) !== oldProcessId
        && Number(status["ticks"]) > 0
    });
    assert.equal(after["giveUpReason"], "");
    example.send({ cmd: "ping" });
    const answered = await waitForStats({
      example,
      isWanted: status => Number(status["pongs"]) > 0
    });
    assert.ok(Number(answered["pongs"]) > 0);
    await example.ask({
      command: {
        cmd: "close"
      },
      kind: "closed"
    });
  } finally {
    example.kill();
    rmSync(userDataFolder, {
      force: true,
      maxRetries: 5,
      recursive: true
    });
  }
});
