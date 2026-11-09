import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

// The web-profiles example (examples/web-profiles) in a real WinUI window, off
// screen and never activated: two WebView2 controls in one process, each in an
// environment of its own. It finds each profile folder on disk, a cookie set in
// one absent from the other, and the Chromium switch on the browser's command
// line. The example starts the Windows App SDK with
// webViewUserDataFolder: false: WEBVIEW2_USER_DATA_FOLDER overrides the folder
// of an environment (measured: with it set, both controls ran in its folder).
// Same skips and the same desktop as test/web-bridge.test.ts.

const TIMEOUT_MILLISECONDS = 300_000;
const POLL_MILLISECONDS = 500;
const FLAG = "--webview-profiles-example";
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

const panesSchema = z.array(
  z.object({
    isStarted: z.boolean(),
    startError: z.string(),
    userDataFolder: z.string(),
    browserProcessId: z.number()
  })
);

function folderOf(value: unknown) {
  return String(value).toLowerCase();
}

test("two controls in one process keep separate profiles and their own browser switches", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED || !existsSync(NATIVE_LIBRARY) || !isWebViewRuntimeInstalled(),
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const folders = ["a", "b"].map(name => mkdtempSync(path.join(tmpdir(), `winui-svelte-web-profiles-${name}-`)));
  const [first, second] = folders;
  assert.ok(first !== undefined && second !== undefined);
  delete process.env["WEBVIEW2_USER_DATA_FOLDER"];
  const example = ExampleProcess.start({
    entry: "examples/web-profiles/main.ts",
    flags: ["--ownFolders", "true", "--first", first, "--second", second],
    env: {}
  });
  try {
    const deadline = Date.now() + TIMEOUT_MILLISECONDS / 2;
    let panes: z.infer<typeof panesSchema> = [];
    while (Date.now() < deadline) {
      const status = await example.ask({
        command: {
          cmd: "stats"
        },
        kind: "stats"
      });
      panes = panesSchema.parse(status["panes"]);
      const isSettled = panes.length === 2 && panes.every(pane => pane.isStarted === true || pane.startError !== "");
      if (isSettled) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
    }

    assert.deepEqual(panes.map(pane => pane.startError), ["", ""]);
    assert.deepEqual(panes.map(pane => folderOf(pane.userDataFolder)), [first, second].map(folderOf));
    assert.ok(existsSync(path.join(first, "EBWebView")), "first folder created");
    assert.ok(existsSync(path.join(second, "EBWebView")), "second folder created");

    const cookies = await example.ask({
      command: {
        cmd: "cookies"
      },
      kind: "cookies"
    });
    assert.deepEqual(cookies["inFirst"], ["first"]);
    assert.deepEqual(cookies["inSecond"], []);

    for (const pane of panes) {
      assert.match(commandLineOf(pane.browserProcessId), new RegExp(FLAG));
    }

    await example.ask({
      command: {
        cmd: "close"
      },
      kind: "closed"
    });
  } finally {
    example.kill();
    for (const folder of folders) {
      rmSync(folder, {
        force: true,
        maxRetries: 5,
        recursive: true
      });
    }
  }
});
