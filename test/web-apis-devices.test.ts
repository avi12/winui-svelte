import { roInitialize } from "@microsoft/dynwinrt";
import { installBattery } from "#src/web-apis/battery.js";
import { installGamepad } from "#src/web-apis/gamepad.js";
import { installGeolocation } from "#src/web-apis/geolocation.js";
import { installNetwork } from "#src/web-apis/network.js";
import { installScreen } from "#src/web-apis/screen.js";
import { installSensors } from "#src/web-apis/sensors.js";
import { initWindowsAppSdk } from "#src/window/bootstrap.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The device Web APIs over this machine's real Windows state, read only:
// nothing is shown, no input is injected and no location is requested (that
// is for a person to look at, as the permission is the user's to give).

initWindowsAppSdk();
roInitialize();

test("battery and network read this machine", async context => {
  const uninstallBattery = installBattery();
  const uninstallNetwork = installNetwork();
  try {
    const manager = await navigator.getBattery();
    assert.ok(manager.level >= 0 && manager.level <= 1);
    assert.equal(typeof manager.charging, "boolean");
    assert.equal(typeof navigator.onLine, "boolean");
    assert.ok(["wifi", "cellular", "ethernet", "none", "unknown"].includes(navigator.connection.type));
    context.diagnostic(`battery ${manager.level} charging ${manager.charging}, online ${navigator.onLine}`);
  } finally {
    uninstallNetwork();
    uninstallBattery();
  }
});

test("screen reads the primary display", async context => {
  const uninstall = installScreen();
  try {
    assert.ok(screen.width > 0 && screen.height > 0);
    assert.ok(screen.availHeight <= screen.height);
    assert.ok(globalThis.devicePixelRatio >= 1);
    const details = await getScreenDetails();
    assert.ok(details.screens.length >= 1);
    context.diagnostic(`screen ${screen.width}x${screen.height} at ${globalThis.devicePixelRatio}, ${details.screens.length} screens`);
  } finally {
    uninstall();
  }
});

test("sensors and gamepads report what is present, and geolocation only installs", context => {
  const uninstallSensors = installSensors();
  const uninstallGamepad = installGamepad();
  const uninstallGeolocation = installGeolocation();
  try {
    assert.equal(navigator.getGamepads().length, 4);
    assert.equal(typeof navigator.geolocation.getCurrentPosition, "function");
    context.diagnostic(`accelerometer: ${"Accelerometer" in globalThis}, light: ${"AmbientLightSensor" in globalThis}`);
  } finally {
    uninstallGeolocation();
    uninstallGamepad();
    uninstallSensors();
  }
});
