import type { ButtonSample } from "./native.ts";
import { createPointerShare } from "./pointer-share.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// GetAsyncKeyState clears "pressed since the last call" for the whole process,
// so the second icon's poll must still hear what the first one's read took.

const RELEASED: ButtonSample = {
  isDown: false,
  wasPressed: false
};
const TAPPED: ButtonSample = {
  isDown: false,
  wasPressed: true
};

function sampleWith(right: ButtonSample) {
  return {
    x: 1,
    y: 2,
    left: RELEASED,
    right,
    middle: RELEASED,
    isOnTray: true
  };
}

// What the OS does: the flag is true for the first read after a tap only.
function operatingSystem() {
  let isTapPending = false;
  return {
    tap() {
      isTapPending = true;
    },
    read() {
      const isTapped = isTapPending;
      isTapPending = false;
      return sampleWith(isTapped ? TAPPED : RELEASED);
    }
  };
}

test("without the share only the first of two readers hears a tap between their reads", () => {
  const system = operatingSystem();
  system.tap();
  assert.equal(system.read().right.wasPressed, true);
  assert.equal(system.read().right.wasPressed, false);
});

test("with the share both readers hear a tap that only one of them read", () => {
  const system = operatingSystem();
  const share = createPointerShare();
  const first = share.join(system.read);
  const second = share.join(system.read);
  system.tap();
  assert.equal(first.read().right.wasPressed, true);
  assert.equal(second.read().right.wasPressed, true);
});

test("a tap is told to each reader once", () => {
  const system = operatingSystem();
  const share = createPointerShare();
  const first = share.join(system.read);
  const second = share.join(system.read);
  system.tap();
  first.read();
  second.read();
  assert.equal(first.read().right.wasPressed, false);
  assert.equal(second.read().right.wasPressed, false);
});

test("a reader that stopped hears nothing and does not keep the others from hearing", () => {
  const system = operatingSystem();
  const share = createPointerShare();
  const first = share.join(system.read);
  const second = share.join(system.read);
  first.stop();
  system.tap();
  assert.equal(second.read().right.wasPressed, true);
});

test("the position, the held state and the tray flag pass through", () => {
  const share = createPointerShare();
  const reader = share.join(() => sampleWith({
    isDown: true,
    wasPressed: false
  }));
  const sample = reader.read();
  assert.deepEqual([sample.x, sample.y, sample.isOnTray, sample.right.isDown], [1, 2, true, true]);
});
