import { roInitialize } from "@microsoft/dynwinrt";
import { installBluetooth } from "#src/web-apis/bluetooth.js";
import { windowsHidBackend } from "#src/web-apis/hid-backend.js";
import { IdleDetector, installIdleDetector } from "#src/web-apis/idle.js";
import { windowsSerialBackend } from "#src/web-apis/serial-backend.js";
import { windowsUsbBackend } from "#src/web-apis/usb-backend.js";
import { installWakeLock } from "#src/web-apis/wake-lock.js";
import { initWindowsAppSdk } from "#src/window/bootstrap.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The hardware Web APIs over the real Windows backends, doing only what is
// harmless: listing devices, asking whether Bluetooth is there, reading the
// idle and lock state, and holding a screen wake lock for one turn. Nothing is
// opened, paired, written to or configured, and no input is injected.

const SINGLE_THREADED_APARTMENT = 0;

initWindowsAppSdk();
roInitialize(SINGLE_THREADED_APARTMENT);

test("a screen wake lock is taken and released at once", async () => {
  const uninstall = installWakeLock();
  try {
    const sentinel = await navigator.wakeLock.request("screen");
    assert.equal(sentinel.released, false);
    assert.equal(navigator.wakeLock.activeCount, 1);
    await sentinel.release();
    assert.equal(sentinel.released, true);
    assert.equal(navigator.wakeLock.activeCount, 0);
  } finally {
    uninstall();
  }
});

test("the idle detector reads the real user and screen state", async context => {
  const uninstall = installIdleDetector();
  try {
    assert.equal(await IdleDetector.requestPermission(), "granted");
    const controller = new AbortController();
    const detector = new IdleDetector();
    await detector.start({ signal: controller.signal });
    assert.ok(["active", "idle"].includes(detector.userState ?? ""));
    assert.ok(["locked", "unlocked"].includes(detector.screenState ?? ""));
    assert.ok((detector.idleMilliseconds ?? -1) >= 0);
    controller.abort();
    context.diagnostic(`user ${detector.userState}, screen ${detector.screenState}, idle ${detector.idleMilliseconds} ms`);
  } finally {
    uninstall();
  }
});

test("Bluetooth availability is read without scanning or pairing", async context => {
  const uninstall = installBluetooth();
  try {
    const isAvailable = await navigator.bluetooth.getAvailability();
    assert.equal(typeof isAvailable, "boolean");
    assert.deepEqual(await navigator.bluetooth.getDevices(), []);
    context.diagnostic(`Bluetooth LE available: ${isAvailable}`);
  } finally {
    uninstall();
  }
});

test("USB, HID and serial devices are listed, never opened", async context => {
  const [usb, hid, serial] = await Promise.all([
    windowsUsbBackend().list(),
    windowsHidBackend().list(),
    windowsSerialBackend().list()
  ]);
  for (const device of [...usb, ...hid]) {
    assert.equal(typeof device.id, "string");
    assert.ok(device.vendorId >= 0);
  }

  for (const port of serial) {
    assert.match(port.portName, /^\w+/u);
  }

  const withUsage = hid.filter(device => device.usagePage !== 0 && device.vendorId !== 0).length;
  context.diagnostic(
    `listed ${usb.length} WinUSB devices, ${hid.length} HID interfaces (${withUsage} with usage and vendor), ${serial.length} serial ports`
  );
});
