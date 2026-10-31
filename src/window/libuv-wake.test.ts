import { idleMillisecondsFor } from "./libuv-wake.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("a thread with nothing active sleeps for long", () => {
  assert.equal(idleMillisecondsFor([]), 250);
  assert.equal(idleMillisecondsFor(["TCPSocketWrap", "MessagePort", "ProcessWrap"]), 250, "libuv's I/O wakes the thread itself");
});

test("a timer Node made keeps a short poll, since no one can ask libuv when it fires", () => {
  assert.equal(idleMillisecondsFor(["MessagePort", "Timeout"]), 16);
});

test("a pending immediate means no sleep at all", () => {
  assert.equal(idleMillisecondsFor(["Timeout", "Immediate"]), 0);
});
