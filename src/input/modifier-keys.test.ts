import { modifierKeysHeld } from "./modifier-keys.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const SHIFT = 0x10;
const CONTROL = 0x11;
const ALT = 0x12;

function holding(...keys: number[]) {
  return (virtualKey: number) => ({ isDown: keys.includes(virtualKey) });
}

test("the held modifier keys are read by their virtual key codes", () => {
  assert.deepEqual(modifierKeysHeld({ readKey: holding() }), {
    shiftKey: false,
    ctrlKey: false,
    altKey: false
  });
  assert.deepEqual(modifierKeysHeld({ readKey: holding(SHIFT) }), {
    shiftKey: true,
    ctrlKey: false,
    altKey: false
  });
  assert.deepEqual(modifierKeysHeld({ readKey: holding(CONTROL, ALT) }), {
    shiftKey: false,
    ctrlKey: true,
    altKey: true
  });
});
