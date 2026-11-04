import { IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import { defineMessaging } from "#src/messaging/index.js";
import { createStdioTransport, MessageType } from "#src/state/host.js";
import type { StateProtocol } from "#src/state/host.js";
import { backgroundEnvironment } from "#src/window/background-mode.js";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// `startDev` (winui-svelte/dev) as the hello example uses it: the window
// opens off screen and a saved edit of App.svelte reaches the open window
// as a hot update, with the process still alive. Skipped where the Windows
// App SDK was not restored.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..");
const ENTRY = path.join(PACKAGE_ROOT, "examples", "hello", "main.ts");
const COMPONENT = path.join(PACKAGE_ROOT, "examples", "hello", "App.svelte");
const TIMEOUT_MILLISECONDS = 240_000;
const EDIT_EVERY_MILLISECONDS = 4000;
const HOT_UPDATE = /hot updated: \/App\.svelte/u;

test("startDev opens the component and a saved edit updates the open window", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const original = readFileSync(COMPONENT, "utf8");
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", ENTRY], {
    cwd: PACKAGE_ROOT,
    env: backgroundEnvironment(),
    stdio: ["ignore", "ignore", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", chunk => {
    stderr += String(chunk);
  });
  let isExited = false;
  child.on("exit", () => {
    isExited = true;
  });
  try {
    let edits = 0;
    const deadline = Date.now() + TIMEOUT_MILLISECONDS - EDIT_EVERY_MILLISECONDS * 2;
    while (!HOT_UPDATE.test(stderr) && !isExited && Date.now() < deadline) {
      edits += 1;
      writeFileSync(COMPONENT, original.replace("Hello from WinUI", `Hello from WinUI ${edits}`));
      await new Promise(resolve => setTimeout(resolve, EDIT_EVERY_MILLISECONDS));
    }

    assert.ok(HOT_UPDATE.test(stderr), `no hot update was reported; stderr: ${stderr.slice(-600)}`);
    assert.equal(isExited, false, "the process survived the update");
  } finally {
    writeFileSync(COMPONENT, original);
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
  }
});

test("startDev with a stdio host hands the window the host's state and ends with the link", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const entry = path.join(PACKAGE_ROOT, "examples", "dev-host", "main.ts");
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", entry], {
    cwd: PACKAGE_ROOT,
    env: backgroundEnvironment(),
    stdio: ["pipe", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", chunk => {
    stderr += String(chunk);
  });
  const exited = new Promise<number | null>(resolve => child.on("exit", resolve));
  try {
    const messaging = defineMessaging<StateProtocol>({
      transport: createStdioTransport({
        input: child.stdout,
        output: child.stdin
      }),
      onError(error) {
        stderr += `host: ${error.message}
`;
      }
    });
    const deadline = Date.now() + TIMEOUT_MILLISECONDS - EDIT_EVERY_MILLISECONDS * 2;
    while (!stderr.includes("view count 3") && Date.now() < deadline) {
      await messaging.sendMessage(MessageType.snapshot, {
        name: "view",
        value: {
          count: 3
        }
      }).catch(() => undefined);
      await new Promise(resolve => setTimeout(resolve, EDIT_EVERY_MILLISECONDS));
    }

    assert.ok(stderr.includes("view count 3"), `the window never showed the host's state; stderr: ${stderr.slice(-600)}`);
    child.stdin.end();
    const code = await Promise.race([exited, new Promise(resolve => setTimeout(() => resolve("stayed"), 20_000))]);
    assert.equal(code, 0, "the window did not close when the host's link ended");
  } finally {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
  }
});
