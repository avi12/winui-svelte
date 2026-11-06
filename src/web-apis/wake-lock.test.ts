import type { PageListener, PageSnapshot } from "./page.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The web wake lock over a stand-in for the display request: the type check,
// release events, the hidden page, and the Permissions API. The real display
// request is for test/web-apis-hardware.test.ts.

const { installWakeLock, WakeLockSentinel } = await import("./wake-lock.ts");
const { installPermissions } = await import("./permissions.ts");
const { installPage } = await import("./page.ts");

function fakeBackend() {
  const log: string[] = [];
  let count = 0;
  return {
    log,
    backend: {
      acquire() {
        count += 1;
        const id = count;
        log.push(`acquire ${id}`);
        return () => log.push(`release ${id}`);
      }
    }
  };
}

function fakeVisibility() {
  let isVisible = true;
  const callbacks = new Set<() => void>();
  return {
    visibility: {
      isVisible: () => isVisible,
      onChange(callback: () => void) {
        callbacks.add(callback);
        return () => callbacks.delete(callback);
      }
    },
    hide() {
      isVisible = false;
      for (const callback of callbacks) {
        callback();
      }
    },
    show() {
      isVisible = true;
    }
  };
}

test("request returns a screen sentinel and release fires once", async () => {
  const fake = fakeBackend();
  const uninstall = installWakeLock({ backend: fake.backend });
  const sentinel = await navigator.wakeLock.request("screen");
  assert.ok(sentinel instanceof WakeLockSentinel);
  assert.equal(sentinel.type, "screen");
  assert.equal(sentinel.released, false);
  let events = 0;
  sentinel.onrelease = () => {
    events += 1;
  };
  await sentinel.release();
  await sentinel.release();
  assert.equal(sentinel.released, true);
  assert.equal(events, 1);
  assert.deepEqual(fake.log, ["acquire 1", "release 1"]);
  uninstall();
});

test("an unknown type is a TypeError", async () => {
  const uninstall = installWakeLock({ backend: fakeBackend().backend });
  // @ts-expect-error -- the standard type admits only "screen"; the runtime check is what this tests
  await assert.rejects(navigator.wakeLock.request("system"), TypeError);
  uninstall();
});

test("a hidden page refuses, and hiding releases the held locks", async () => {
  const fake = fakeBackend();
  const page = fakeVisibility();
  const uninstall = installWakeLock({
    backend: fake.backend,
    visibility: page.visibility
  });
  const sentinel = await navigator.wakeLock.request();
  const released: boolean[] = [];
  sentinel.addEventListener("release", () => released.push(sentinel.released));
  page.hide();
  await new Promise<void>(resolve => {
    setImmediate(resolve);
  });
  assert.deepEqual(released, [true]);
  await assert.rejects(navigator.wakeLock.request("screen"), error => error instanceof DOMException && error.name === "NotAllowedError");
  page.show();
  await navigator.wakeLock.request("screen");
  uninstall();
});

test("the extra counts the active locks, and uninstalling releases them", async () => {
  const fake = fakeBackend();
  const uninstall = installWakeLock({ backend: fake.backend });
  const first = await navigator.wakeLock.request("screen");
  await navigator.wakeLock.request("screen");
  assert.equal(navigator.wakeLock.activeCount, 2);
  await first.release();
  assert.equal(navigator.wakeLock.activeCount, 1);
  uninstall();
  await new Promise<void>(resolve => {
    setImmediate(resolve);
  });
  assert.deepEqual(fake.log, ["acquire 1", "acquire 2", "release 1", "release 2"]);
  assert.equal("wakeLock" in navigator, false);
});

test("the Permissions API says granted", async () => {
  const uninstallPermissions = installPermissions();
  const uninstall = installWakeLock({ backend: fakeBackend().backend });
  const status = await navigator.permissions.query({ name: "screen-wake-lock" });
  assert.equal(status.state, "granted");
  uninstall();
  uninstallPermissions();
});

test("with the page module installed, minimizing the window releases the locks", async () => {
  const fake = fakeBackend();
  let snapshot: PageSnapshot = {
    isVisible: true,
    isDisplayOn: true,
    resumeCount: 0,
    isFocused: true,
    state: "normal",
    title: "Window",
    isClosed: false
  };
  let listener: PageListener | undefined;
  const uninstallPage = installPage({
    backend: {
      read: () => snapshot,
      subscribe(next) {
        listener = next;
        return () => {
          listener = undefined;
        };
      },
      setState() {},
      setTitle() {},
      close() {},
      open() {}
    }
  });
  const uninstall = installWakeLock({ backend: fake.backend });
  try {
    const sentinel = await navigator.wakeLock.request("screen");
    snapshot = {
      ...snapshot,
      isVisible: false
    };
    listener?.changed();
    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });
    assert.equal(sentinel.released, true);
    await assert.rejects(navigator.wakeLock.request("screen"), error => error instanceof DOMException && error.name === "NotAllowedError");
  } finally {
    uninstall();
    uninstallPage();
  }
});
