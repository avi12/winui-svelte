import assert from "node:assert/strict";
import { test } from "node:test";

// GetSystemMetrics is read-only: the real call answers on any Windows machine.

const { readPointerDevices } = await import("./pointer-devices.ts");

test("the pointing devices are read from Windows as three flags", () => {
  const devices = readPointerDevices();
  assert.deepEqual(Object.keys(devices).sort(), ["hasMouse", "hasPen", "hasTouch"]);
  for (const isPresent of Object.values(devices)) {
    assert.equal(typeof isPresent, "boolean");
  }
});
