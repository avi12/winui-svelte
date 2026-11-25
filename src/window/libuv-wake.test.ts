import { idleMillisecondsFor, startLibuvWake } from "./libuv-wake.ts";
import { findLoopCompletionPort, isCompletionPortWaitable, waitForHandle } from "./native.ts";
import assert from "node:assert/strict";
import { readFile } from "node:fs";
import { test } from "node:test";

const WAIT_MILLISECONDS = 5000;

// A blocking wait right after the read starts: only the read's own completion can end it early.
function isWokenByRead(wake: NonNullable<ReturnType<typeof startLibuvWake>>) {
  return new Promise<boolean>(resolve => {
    setImmediate(() => {
      let isWoken = false;
      readFile(import.meta.filename, () => resolve(isWoken));
      wake.arm();
      isWoken = waitForHandle({
        handle: wake.handle,
        milliseconds: WAIT_MILLISECONDS
      });
      wake.disarm();
    });
  });
}

test("this system's waits can listen to a completion port", () => {
  assert.equal(isCompletionPortWaitable(), true);
});

test("the message wait is given libuv's own port, and a file read ends the wait", async () => {
  const wake = startLibuvWake();
  assert.ok(wake);
  assert.equal(wake.handle, findLoopCompletionPort());
  assert.equal(await isWokenByRead(wake), true);
});

test("where a port cannot be waited on, a thread's event ends the wait", async () => {
  const wake = startLibuvWake({ isPortWaitable: () => false });
  assert.ok(wake);
  assert.notEqual(wake.handle, findLoopCompletionPort());
  try {
    assert.equal(await isWokenByRead(wake), true);
  } finally {
    wake.stop();
  }
});

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
