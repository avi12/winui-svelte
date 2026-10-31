import type { GamepadSample } from "#src/devices/gamepad.js";
import { GamepadButtons } from "#src/devices/gamepad.js";
import assert from "node:assert/strict";
import { mock, test } from "node:test";

// navigator.getGamepads over stand-in controllers: the standard mapping, the
// connect and disconnect events, slots, haptics and the WinUI extras.

const { Gamepad, GamepadEvent, installGamepad } = await import("./gamepad.ts");

type Backend = NonNullable<Parameters<typeof installGamepad>[0]>["backend"];
type Device = ReturnType<NonNullable<Backend>["list"]>[number];

const NEUTRAL = {
  timestamp: 0n,
  buttons: 0,
  leftTrigger: 0,
  rightTrigger: 0,
  leftThumbstickX: 0,
  leftThumbstickY: 0,
  rightThumbstickX: 0,
  rightThumbstickY: 0
} satisfies GamepadSample;

function fakeDevice(sample: GamepadSample = NEUTRAL) {
  const vibrations: unknown[] = [];
  const device = {
    isWireless: true,
    sample,
    read() {
      return this.sample;
    },
    vibrate(levels) {
      vibrations.push(levels);
    },
    battery: () => ({ percent: 60 })
  } satisfies Device & { sample: GamepadSample };
  return {
    device,
    vibrations
  };
}

function fakeBackend(first: Device[]) {
  let devices = first;
  let notify: (() => void) | undefined;
  let stops = 0;
  return {
    backend: {
      list: () => devices,
      subscriptions: [
        (callback: () => void) => {
          notify = callback;
          return () => {
            stops += 1;
          };
        }
      ]
    },
    set(next: Device[]) {
      devices = next;
      notify?.();
    },
    get stops() {
      return stops;
    }
  };
}

function immediately(work: () => void) {
  work();
}

test("a controller in the standard mapping", () => {
  const first = fakeDevice({
    ...NEUTRAL,
    buttons: GamepadButtons.A | GamepadButtons.DPadUp | GamepadButtons.Menu,
    leftTrigger: 0.5,
    leftThumbstickY: 1,
    rightThumbstickX: -1
  });
  const fake = fakeBackend([first.device]);
  const uninstall = installGamepad({
    backend: fake.backend,
    deliver: immediately
  });
  const slots = navigator.getGamepads();
  assert.equal(slots.length, 4);
  const pad = slots[0];
  assert.ok(pad instanceof Gamepad);
  assert.equal(pad.mapping, "standard");
  assert.equal(pad.index, 0);
  assert.equal(pad.connected, true);
  assert.equal(pad.axes.length, 4);
  assert.deepEqual(pad.axes, [0, -1, -1, -0]);
  assert.equal(pad.buttons.length, 17);
  assert.equal(pad.buttons[0]?.pressed, true);
  assert.equal(pad.buttons[9]?.pressed, true);
  assert.equal(pad.buttons[12]?.pressed, true);
  assert.equal(pad.buttons[1]?.pressed, false);
  assert.equal(pad.buttons[6]?.value, 0.5);
  assert.equal(pad.buttons[16]?.pressed, false);
  assert.equal(slots[1], null);
  uninstall();
});

test("getGamepads refreshes the readings", () => {
  const first = fakeDevice();
  const fake = fakeBackend([first.device]);
  const uninstall = installGamepad({
    backend: fake.backend,
    deliver: immediately
  });
  const pad = navigator.getGamepads()[0];
  assert.ok(pad instanceof Gamepad);
  assert.equal(pad.buttons[2]?.pressed, false);
  first.device.sample = {
    ...NEUTRAL,
    buttons: GamepadButtons.X
  };
  assert.equal(navigator.getGamepads()[0], pad);
  assert.equal(pad.buttons[2]?.pressed, true);
  uninstall();
});

test("connecting and disconnecting fire the window events and free the slot", () => {
  const first = fakeDevice();
  const second = fakeDevice();
  const fake = fakeBackend([first.device]);
  const uninstall = installGamepad({
    backend: fake.backend,
    deliver: immediately
  });
  const seen: string[] = [];
  for (const type of ["gamepadconnected", "gamepaddisconnected"]) {
    globalThis.addEventListener(type, event => {
      assert.ok(event instanceof GamepadEvent);
      seen.push(`${type}:${event.gamepad.index}`);
    });
  }

  navigator.getGamepads();
  fake.set([first.device, second.device]);
  fake.set([second.device]);
  fake.set([first.device, second.device]);
  assert.deepEqual(seen, [
    "gamepadconnected:0",
    "gamepadconnected:1",
    "gamepaddisconnected:0",
    "gamepadconnected:0"
  ]);
  uninstall();
});

test("a disconnected gamepad reads connected false", () => {
  const first = fakeDevice();
  const fake = fakeBackend([first.device]);
  const uninstall = installGamepad({
    backend: fake.backend,
    deliver: immediately
  });
  const pad = navigator.getGamepads()[0];
  assert.ok(pad instanceof Gamepad);
  fake.set([]);
  assert.equal(pad.connected, false);
  assert.equal(navigator.getGamepads()[0], null);
  uninstall();
});

test("playEffect drives the motors for the duration and resolves complete", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const first = fakeDevice();
  const fake = fakeBackend([first.device]);
  const uninstall = installGamepad({
    backend: fake.backend,
    deliver: immediately
  });
  const pad = navigator.getGamepads()[0];
  assert.ok(pad instanceof Gamepad);
  const done = pad.vibrationActuator.playEffect("dual-rumble", {
    startDelay: 10,
    duration: 100,
    strongMagnitude: 1,
    weakMagnitude: 0.25
  });
  mock.timers.tick(10);
  assert.deepEqual(first.vibrations, [{
    leftMotor: 1,
    rightMotor: 0.25,
    leftTrigger: 0,
    rightTrigger: 0
  }]);
  mock.timers.tick(100);
  assert.equal(await done, "complete");
  assert.deepEqual(first.vibrations.at(-1), {
    leftMotor: 0,
    rightMotor: 0,
    leftTrigger: 0,
    rightTrigger: 0
  });
  mock.timers.reset();
  uninstall();
});

test("a newer effect preempts, trigger-rumble drives the triggers, reset stops", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const first = fakeDevice();
  const fake = fakeBackend([first.device]);
  const uninstall = installGamepad({
    backend: fake.backend,
    deliver: immediately
  });
  const pad = navigator.getGamepads()[0];
  assert.ok(pad instanceof Gamepad);
  const older = pad.vibrationActuator.playEffect("dual-rumble", {
    duration: 1000,
    strongMagnitude: 1
  });
  const newer = pad.vibrationActuator.playEffect("trigger-rumble", {
    duration: 50,
    leftTrigger: 0.5
  });
  assert.equal(await older, "preempted");
  mock.timers.tick(0);
  assert.deepEqual(first.vibrations.at(-1), {
    leftMotor: 0,
    rightMotor: 0,
    leftTrigger: 0.5,
    rightTrigger: 0
  });
  assert.equal(await pad.vibrationActuator.reset(), "complete");
  assert.equal(await newer, "preempted");
  assert.deepEqual(first.vibrations.at(-1), {
    leftMotor: 0,
    rightMotor: 0,
    leftTrigger: 0,
    rightTrigger: 0
  });
  assert.equal(await pad.vibrationActuator.playEffect("dual-rumble", { duration: Number.NaN }), "invalid-parameter");
  mock.timers.reset();
  uninstall();
});

test("the WinUI extras", () => {
  const first = fakeDevice();
  const fake = fakeBackend([first.device]);
  const uninstall = installGamepad({
    backend: fake.backend,
    deliver: immediately
  });
  const pad = navigator.getGamepads()[0];
  assert.ok(pad instanceof Gamepad);
  assert.equal(pad.isWireless, true);
  assert.equal(pad.batteryPercent, 60);
  uninstall();
});

test("uninstall stops listening and removes the API", () => {
  const fake = fakeBackend([]);
  const uninstall = installGamepad({
    backend: fake.backend,
    deliver: immediately
  });
  uninstall();
  assert.equal(fake.stops, 1);
  assert.equal("getGamepads" in navigator, false);
  assert.equal("GamepadEvent" in globalThis, false);
});
