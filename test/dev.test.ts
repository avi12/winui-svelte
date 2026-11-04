import { IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
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
