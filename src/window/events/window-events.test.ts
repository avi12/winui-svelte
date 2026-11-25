import { WindowEventTarget } from "./window-events.ts";
import type { Window } from "#src/winui.js";
import assert from "node:assert/strict";
import { test } from "node:test";

type Callback = (sender: unknown, args: { cancel: boolean }) => void;

function fakeWindow() {
  const callbacks: Callback[] = [];
  const window = {
    appWindow: {
      onClosing(callback: Callback) {
        callbacks.push(callback);
      }
    }
  };
  return {
    callbacks,
    // A stand-in with the one native event these tests raise.
    target: new WindowEventTarget(window as unknown as Window),
    raise() {
      const args = { cancel: false };
      for (const callback of callbacks) {
        callback(null, args);
      }

      return args;
    }
  };
}

test("the native event is subscribed once, and each listener gets the SDK's arguments", () => {
  const { callbacks, target, raise } = fakeWindow();
  assert.equal(callbacks.length, 0);
  const seen: unknown[] = [];
  target.addEventListener("closing", event => seen.push(event.args));
  target.addEventListener("closing", event => seen.push(event.args));
  assert.equal(callbacks.length, 1);
  const args = raise();
  assert.deepEqual(seen, [args, args]);
  assert.equal(args.cancel, false);
});

test("preventDefault keeps the window open, and a removed listener no longer does", () => {
  const { target, raise } = fakeWindow();
  function keepOpen(event: Event) {
    event.preventDefault();
  }

  target.addEventListener("closing", keepOpen);
  assert.equal(raise().cancel, true);
  target.removeEventListener("closing", keepOpen);
  assert.equal(raise().cancel, false);
});

test("once and signal work as in a browser", () => {
  const { target, raise } = fakeWindow();
  const stop = new AbortController();
  let count = 0;
  target.addEventListener("closing", () => count++, { once: true });
  target.addEventListener("closing", () => count++, { signal: stop.signal });
  raise();
  stop.abort();
  raise();
  assert.equal(count, 2);
});
