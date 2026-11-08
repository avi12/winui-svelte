import { createUiaWorker, UiaControlType } from "./index.ts";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { test } from "node:test";

// The real UI Automation calls against a window the test starts itself (a
// WinForms form with a multi-line edit box of known text) and ends by its own
// pid. It skips where no desktop session can show a window.

const FORM_TIMEOUT_MILLISECONDS = 20_000;
const POLL_MILLISECONDS = 250;
const LINES = ["alpha line", "beta line", "gamma line"];
const SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.Text = 'uia-known-window'
$box = New-Object System.Windows.Forms.TextBox
$box.Multiline = $true
$box.Dock = 'Fill'
$box.Text = '${LINES.join("\\r\\n")}'.Replace('\\r\\n', [Environment]::NewLine)
$form.Controls.Add($box)
[System.Windows.Forms.Application]::Run($form)
`;

async function windowOf(pid: number) {
  const deadline = Date.now() + FORM_TIMEOUT_MILLISECONDS;
  while (Date.now() < deadline) {
    const result = spawnSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).MainWindowHandle.ToInt64()`
    ], { encoding: "utf8" });
    const hwnd = BigInt(result.stdout.trim() || "0");
    const isHwnd0n = hwnd !== 0n;
    if (isHwnd0n) {
      return hwnd;
    }

    await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
  }

  return null;
}

test("the worker reads the exact text of a window the test started", {
  skip: process.platform !== "win32",
  timeout: FORM_TIMEOUT_MILLISECONDS * 3
}, async context => {
  const child = spawn("powershell.exe", ["-NoProfile", "-STA", "-Command", SCRIPT], { stdio: "ignore" });
  const worker = createUiaWorker();
  context.after(() => {
    worker.close();
    child.kill();
  });
  const { pid } = child;
  assert.ok(pid);
  const hwnd = await windowOf(pid);
  const isHwndNull = hwnd === null;
  if (isHwndNull) {
    context.skip("no desktop session showed a window");
    return;
  }

  const text = await worker.readText({
    target: {
      hwnd
    },
    hardMilliseconds: 10_000
  });
  assert.ok(text);
  assert.equal(text.title, "uia-known-window");
  const joined = text.blocks.map(block => block.text).join("\n");
  for (const line of LINES) {
    assert.ok(joined.includes(line), `${line} is missing from ${JSON.stringify(joined)}`);
  }

  assert.equal(UiaControlType.window, 50032);
});
