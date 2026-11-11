import { CALLBACK_MESSAGE } from "./message-mailbox.ts";
import { createTrayNative } from "./native.ts";
import { bindDll } from "#src/win32-calls.js";
import assert from "node:assert/strict";
import { test } from "node:test";

const user32 = bindDll({
  dll: "user32.dll",
  functions: {
    send: ["SendMessageW", ["pointer", "u32", "i64", "i64"], "pointer"]
  }
});

const SELECT = 0x400;
const CONTEXT_MENU = 0x7b;
const ANCHOR_X = 3346;
const ANCHOR_Y = 1955;
const ANCHOR = BigInt(ANCHOR_X) | (BigInt(ANCHOR_Y) << 16n);

test("a message sent to the owner window is read back with its anchor", () => {
  const native = createTrayNative();
  const owner = native.createOwnerWindow();
  try {
    user32.send(owner, CALLBACK_MESSAGE, ANCHOR, BigInt(SELECT));
    user32.send(owner, CALLBACK_MESSAGE, ANCHOR, BigInt(CONTEXT_MENU));
    assert.deepEqual(native.readMessages(owner), [
      {
        notification: SELECT,
        x: ANCHOR_X,
        y: ANCHOR_Y
      },
      {
        notification: CONTEXT_MENU,
        x: ANCHOR_X,
        y: ANCHOR_Y
      }
    ]);
    assert.deepEqual(native.readMessages(owner), []);
  } finally {
    native.destroyWindow(owner);
  }
});

test("another message is left to the default window procedure", () => {
  const native = createTrayNative();
  const owner = native.createOwnerWindow();
  try {
    user32.send(owner, 0x0, 0n, 0n);
    assert.deepEqual(native.readMessages(owner), []);
  } finally {
    native.destroyWindow(owner);
  }
});
