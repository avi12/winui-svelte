import { DeviceClass, DeviceInformationKind, DeviceWatcherStatus, RadioKind } from "./bindings.ts";
import { findAllDevices } from "./find-devices.ts";
import { readInputCapabilities } from "./input-capabilities.ts";
import { DeviceInterfaceClass, selectorOfInterfaceClasses } from "./interface-classes.ts";
import { windowsPrinterSource } from "./native.ts";
import { unboxed } from "./property-value.ts";
import { roInitialize } from "@microsoft/dynwinrt";
import "#src/state/test-support/svelte-runes.js";
import { PropertyValue } from "#winui/windows/foundation/PropertyValue";
import assert from "node:assert/strict";
import { test } from "node:test";

// This machine's real devices, read only: nothing is paired, connected,
// written, printed, or sent. Each test asserts the shape of what Windows
// returns (the count and the names depend on the machine), and that a call
// that works unpackaged from node.exe does.

roInitialize();

const { flushSync } = await import("svelte");
const { track } = await import("#src/state/test-support/track.svelte.js");
const { getBluetoothAdapter } = await import("./bluetooth-devices.ts");
const { deliverNow } = await import("./delivery.ts");
const { deviceWatcher } = await import("./device-watcher.svelte.ts");
const { windowsNetworkSource } = await import("./network-information.svelte.ts");
const { windowsPowerSource } = await import("./power.svelte.ts");
const { getRadios } = await import("./radios.svelte.ts");
const { windowsAudioDefaults } = await import("./audio-devices.svelte.ts");
const { getDisplayMonitors } = await import("./displays.svelte.ts");
const { windowsGamepadSource } = await import("./gamepads.svelte.ts");
const { listPrinters } = await import("./printers.svelte.ts");
const { bluetoothScanner } = await import("./bluetooth-scanner.svelte.ts");

const ENUMERATION_TIMEOUT_MILLISECONDS = 15_000;
const POLL_MILLISECONDS = 25;
const SCAN_MILLISECONDS = 1500;
const FULL_PERCENT = 100;
const INT_VALUE = 42;
const DOUBLE_VALUE = 1.5;

function pause(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function until(isDone: () => boolean) {
  const deadline = Date.now() + ENUMERATION_TIMEOUT_MILLISECONDS;
  while (!isDone() && Date.now() < deadline) {
    await pause(POLL_MILLISECONDS);
  }

  assert.ok(isDone(), "the condition held before the timeout");
}

test("boxed WinRT values come out as plain JavaScript", () => {
  assert.equal(unboxed(PropertyValue.createString("Speakers")), "Speakers");
  assert.equal(unboxed(PropertyValue.createBoolean(true)), true);
  assert.equal(unboxed(PropertyValue.createInt32(INT_VALUE)), INT_VALUE);
  assert.equal(unboxed(PropertyValue.createDouble(DOUBLE_VALUE)), DOUBLE_VALUE);
  assert.equal(unboxed(null), null);
  assert.equal(unboxed("already plain"), "already plain");
});

test("the interface class selector names each class and requires it enabled", () => {
  const selector = selectorOfInterfaceClasses(DeviceInterfaceClass.mouse, DeviceInterfaceClass.keyboard);
  assert.match(selector, /^\(System\.Devices\.InterfaceClassGuid:="\{378de44c-.*\}" OR System\.Devices\.InterfaceClassGuid:="\{884b96c3-.*\}"\) AND /u);
  assert.match(selector, /InterfaceEnabled/u);
});

test("the audio render devices are listed with their ids, names and properties", async () => {
  const found = await findAllDevices({
    deviceClass: DeviceClass.AudioRender,
    requestedProperties: ["System.Devices.InterfaceEnabled"]
  });
  for (const device of found) {
    assert.equal(typeof device.id, "string");
    assert.equal(typeof device.name, "string");
    assert.equal(device.kind, DeviceInformationKind.DeviceInterface);
    assert.equal(typeof device.isEnabled, "boolean");
    assert.equal(typeof device.properties.get("System.Devices.InterfaceEnabled"), "boolean");
    assert.equal(typeof device.pairing?.canPair, "boolean");
  }
});

test("a device watcher lists the audio endpoints, completes, and stops with its scope", async () => {
  let watch: ReturnType<typeof deviceWatcher> | undefined;
  const scope = track(() => {
    watch = deviceWatcher({
      deviceClass: DeviceClass.AudioRender,
      requestedProperties: ["System.Devices.InterfaceEnabled"],
      deliver: deliverNow
    });
  });
  const current = watch;
  assert.ok(current);
  await until(() => current.isEnumerationCompleted);
  flushSync();
  const found = await findAllDevices({ deviceClass: DeviceClass.AudioRender });
  assert.equal(current.status, DeviceWatcherStatus.EnumerationCompleted);
  assert.equal(current.error, null);
  assert.equal(current.devices.size, found.length);
  assert.deepEqual([...current.devices.keys].sort(), found.map(device => device.id).sort());
  scope.stop();
  flushSync();
  assert.equal(current.status, DeviceWatcherStatus.Stopped);
});

test("the input capabilities are read from Windows", () => {
  const input = readInputCapabilities();
  assert.equal(typeof input.hasMouse, "boolean");
  assert.equal(typeof input.hasKeyboard, "boolean");
  assert.equal(typeof input.hasTouch, "boolean");
  assert.ok(input.mouseButtons >= 0);
  assert.ok(input.touchContacts >= 0);
  assert.ok(Array.isArray(input.pointerDevices));
  for (const device of input.pointerDevices) {
    assert.equal(typeof device.isIntegrated, "boolean");
    assert.ok(device.maxContacts >= 0);
  }

  assert.equal(input.canHover, input.hasMouse || input.hasPen || input.hasTouchpad);
});

test("the Bluetooth adapter, when there is one, says what it supports", async () => {
  const adapter = await getBluetoothAdapter();
  const hasNoAdapter = adapter === null;
  if (hasNoAdapter) {
    return;
  }

  assert.equal(typeof adapter.deviceId, "string");
  assert.match(adapter.addressText, /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/u);
  assert.equal(typeof adapter.isLowEnergySupported, "boolean");
  assert.equal(typeof adapter.isCentralRoleSupported, "boolean");
});

test("the radios have a name, a kind and a state", async () => {
  const radios = await getRadios();
  for (const radio of radios) {
    assert.equal(typeof radio.name, "string");
    assert.ok(Object.values(RadioKind).includes(radio.kind));
    assert.equal(typeof radio.state, "number");
  }
});

test("the printers are listed with a status, and the default is among them", () => {
  const source = windowsPrinterSource();
  const printers = listPrinters({ source });
  const defaultName = source.defaultName();
  for (const printer of printers) {
    assert.equal(typeof printer.name, "string");
    assert.equal(typeof printer.status, "number");
    assert.equal(typeof printer.isOffline, "boolean");
    assert.ok(printer.jobCount >= 0);
  }

  const hasDefault = defaultName !== null;
  if (hasDefault) {
    assert.equal(printers.filter(printer => printer.isDefault).length, 1);
    assert.ok(printers.some(printer => printer.name === defaultName));
  }
});

test("the power state is read, with a percent and no battery numbers when there is no battery", () => {
  const reading = windowsPowerSource().read();
  assert.ok(reading.remainingChargePercent >= 0 && reading.remainingChargePercent <= FULL_PERCENT);
  assert.equal(typeof reading.batteryStatus, "number");
  assert.equal(typeof reading.powerSupplyStatus, "number");
});

test("the network connection is read", () => {
  const reading = windowsNetworkSource().read();
  assert.equal(typeof reading.profileName, "string");
  assert.equal(typeof reading.connectivity, "number");
  assert.equal(typeof reading.isWifi, "boolean");
  assert.ok(Array.isArray(reading.profileNames));
});

test("the default audio endpoints are ids", () => {
  const defaults = windowsAudioDefaults().read(0);
  assert.equal(typeof defaults.outputId, "string");
  assert.equal(typeof defaults.inputId, "string");
});

test("the monitors have a name and a native resolution", async () => {
  const monitors = await getDisplayMonitors();
  for (const monitor of monitors) {
    assert.equal(typeof monitor.name, "string");
    assert.ok(monitor.nativeWidth > 0);
    assert.ok(monitor.nativeHeight > 0);
  }
});

test("the gamepads are a list", () => {
  const list = windowsGamepadSource().list();
  for (const pad of list) {
    assert.equal(typeof pad.isWireless, "boolean");
  }
});

test("a short passive Bluetooth scan reports what it hears, or why it cannot", async () => {
  let scanner: ReturnType<typeof bluetoothScanner> | undefined;
  const scope = track(() => {
    scanner = bluetoothScanner({ deliver: deliverNow });
  });
  const current = scanner;
  assert.ok(current);
  current.start();

  const canScan = current.error === null;
  if (canScan) {
    await pause(SCAN_MILLISECONDS);
  }

  current.stop();
  for (const advertisement of current.advertisements) {
    assert.match(advertisement.addressText, /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/u);
    assert.equal(typeof advertisement.rssi, "number");
    assert.ok(Array.isArray(advertisement.serviceUuids));
  }

  scope.stop();
  flushSync();
});
