import { DpiAwareness } from "./dpi-awareness.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

// The real calls, in a child process of their own (the setting is once per
// process): no window is needed, so no desktop input is involved.

const MODULE_URL = new URL("./dpi-awareness.ts", import.meta.url).href;

const CHILD_SCRIPT = `
import { processDpiAwareness, requestDpiAwareness } from ${JSON.stringify(MODULE_URL)};
const before = processDpiAwareness();
const requested = process.argv[1];
requestDpiAwareness(requested);
requestDpiAwareness(requested);
console.log(JSON.stringify({ before, after: processDpiAwareness() }));
`;

function runChild(requested: DpiAwareness) {
  const output = execFileSync(process.execPath, [
    "--disable-warning=ExperimentalWarning",
    "--input-type=module",
    "--eval",
    CHILD_SCRIPT,
    requested
  ], { encoding: "utf8" });
  return JSON.parse(output.trim());
}

test("node.exe starts unaware and the request makes it per-monitor v2, a second one is accepted", () => {
  const { before, after } = runChild(DpiAwareness.perMonitorV2);
  assert.equal(before, DpiAwareness.unaware);
  assert.equal(after, DpiAwareness.perMonitorV2);
});

test("the awareness asked for is the one reported", () => {
  const { after } = runChild(DpiAwareness.system);
  assert.equal(after, DpiAwareness.system);
});
