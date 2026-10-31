import type { SensorValues } from "./sensors.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The Generic Sensor classes over stand-in channels, and the Windows backend's
// unit conversions over stand-in WinRT sensors.

const {
  AbsoluteOrientationSensor,
  Accelerometer,
  AmbientLightSensor,
  Barometer,
  Gyroscope,
  installSensors,
  SensorKind,
  windowsSensorBackend
} = await import("./sensors.ts");
const { installPermissions, Permissions } = await import("./permissions.ts");

type Backend = NonNullable<Parameters<typeof installSensors>[0]>["backend"];
type Kind = (typeof SensorKind)[keyof typeof SensorKind];

function immediately(work: () => void) {
  work();
}

function fakeBackend(available: readonly Kind[]) {
  const intervals: number[] = [];
  const values: { -readonly [Kind in keyof SensorValues]?: SensorValues[Kind] } = {};
  const notifies: Array<() => void> = [];
  let stops = 0;
  const backend = {
    isAvailable: kind => available.includes(kind),
    open(kind) {
      if (!available.includes(kind)) {
        return null;
      }

      return {
        read: () => values[kind] ?? null,
        listen(notify) {
          notifies.push(notify);
          return () => {
            stops += 1;
          };
        },
        setIntervalMilliseconds(milliseconds) {
          intervals.push(milliseconds);
        }
      };
    }
  } satisfies NonNullable<Backend>;
  return {
    backend,
    intervals,
    set<Chosen extends Kind>(kind: Chosen, value: SensorValues[Chosen]) {
      values[kind] = value;
      for (const notify of notifies) {
        notify();
      }
    },
    values,
    get stops() {
      return stops;
    }
  };
}

test("only the sensors the machine has are defined", () => {
  const fake = fakeBackend([SensorKind.ACCELEROMETER, SensorKind.AMBIENT_LIGHT]);
  const uninstall = installSensors({
    backend: fake.backend,
    deliver: immediately
  });
  assert.equal("Accelerometer" in globalThis, true);
  assert.equal("AmbientLightSensor" in globalThis, true);
  assert.equal("Gyroscope" in globalThis, false);
  assert.equal("Sensor" in globalThis, true);
  uninstall();
  assert.equal("Accelerometer" in globalThis, false);
  assert.equal("Sensor" in globalThis, false);
});

test("an accelerometer activates, then reads, then forgets on stop", () => {
  const fake = fakeBackend([SensorKind.ACCELEROMETER]);
  fake.values.accelerometer = {
    x: 0,
    y: 0,
    z: 9.8
  };
  const uninstall = installSensors({
    backend: fake.backend,
    deliver: immediately
  });
  const sensor = new Accelerometer({ frequency: 10 });
  const seen: string[] = [];
  sensor.onactivate = () => seen.push("activate");
  sensor.onreading = () => seen.push(`reading:${sensor.z}`);
  assert.equal(sensor.activated, false);
  assert.equal(sensor.x, null);
  sensor.start();
  assert.equal(sensor.activated, true);
  assert.equal(sensor.hasReading, true);
  assert.equal(typeof sensor.timestamp, "number");
  assert.deepEqual(fake.intervals, [100]);
  fake.set(SensorKind.ACCELEROMETER, {
    x: 1,
    y: 2,
    z: 3
  });
  assert.deepEqual(seen, ["activate", "reading:9.8", "reading:3"]);
  sensor.stop();
  assert.equal(fake.stops, 1);
  assert.equal(sensor.hasReading, false);
  assert.equal(sensor.x, null);
  assert.equal(sensor.timestamp, null);
  uninstall();
});

test("start without a reading yet activates without firing reading", () => {
  const fake = fakeBackend([SensorKind.GYROSCOPE]);
  const uninstall = installSensors({
    backend: fake.backend,
    deliver: immediately
  });
  const sensor = new Gyroscope();
  const seen: string[] = [];
  sensor.onreading = () => seen.push("reading");
  sensor.start();
  assert.deepEqual(seen, []);
  assert.equal(sensor.hasReading, false);
  fake.set(SensorKind.GYROSCOPE, {
    x: 0.1,
    y: 0.2,
    z: 0.3
  });
  assert.deepEqual(seen, ["reading"]);
  assert.equal(sensor.y, 0.2);
  sensor.stop();
  uninstall();
});

test("starting a missing sensor fires error with NotReadableError", async () => {
  const fake = fakeBackend([]);
  const uninstall = installSensors({
    backend: fake.backend,
    deliver: immediately
  });
  const sensor = new Barometer();
  const name = await new Promise<string>(resolve => {
    sensor.onerror = event => {
      assert.ok("error" in event && event.error instanceof DOMException);
      resolve(event.error.name);
    };
    sensor.start();
  });
  assert.equal(name, "NotReadableError");
  assert.equal(sensor.activated, false);
  uninstall();
});

test("start twice listens once", () => {
  const fake = fakeBackend([SensorKind.AMBIENT_LIGHT]);
  const uninstall = installSensors({
    backend: fake.backend,
    deliver: immediately
  });
  const sensor = new AmbientLightSensor();
  sensor.start();
  sensor.start();
  fake.set(SensorKind.AMBIENT_LIGHT, { illuminance: 120 });
  assert.equal(sensor.illuminance, 120);
  sensor.stop();
  assert.equal(fake.stops, 1);
  uninstall();
});

test("populateMatrix writes a 4 by 4 column-major matrix and checks its target", () => {
  const fake = fakeBackend([SensorKind.ABSOLUTE_ORIENTATION]);
  const uninstall = installSensors({
    backend: fake.backend,
    deliver: immediately
  });
  const sensor = new AbsoluteOrientationSensor();
  assert.throws(() => sensor.populateMatrix(new Float32Array(16)), { name: "NotReadableError" });
  sensor.start();
  fake.set(SensorKind.ABSOLUTE_ORIENTATION, {
    quaternion: [0, 0, 0, 1],
    matrix: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    yawAccuracy: 3
  });
  assert.deepEqual(sensor.quaternion, [0, 0, 0, 1]);
  const target = new Float64Array(16);
  sensor.populateMatrix(target);
  assert.deepEqual([...target], [1, 4, 7, 0, 2, 5, 8, 0, 3, 6, 9, 0, 0, 0, 0, 1]);
  assert.throws(() => sensor.populateMatrix(new Float32Array(9)), TypeError);
  assert.equal(sensor.yawAccuracy, 3);
  sensor.stop();
  uninstall();
});

test("the permissions are granted for a present sensor and denied for an absent one", async () => {
  const fake = fakeBackend([SensorKind.ACCELEROMETER]);
  const permissions = new Permissions();
  const uninstallPermissions = installPermissions();
  const uninstall = installSensors({
    backend: fake.backend,
    deliver: immediately
  });
  assert.equal((await permissions.query({ name: "accelerometer" })).state, "granted");
  assert.equal((await permissions.query({ name: "gyroscope" })).state, "denied");
  assert.equal((await permissions.query({ name: "ambient-light-sensor" })).state, "denied");
  uninstall();
  uninstallPermissions();
});

test("the Windows backend converts g and degrees per second, and clamps the interval", () => {
  const native = {
    minimumReportInterval: 16,
    reportInterval: 0,
    getCurrentReading: () => ({
      accelerationX: 1,
      accelerationY: 0,
      accelerationZ: -1
    }),
    onReadingChanged: () => () => undefined
  };
  function missing() {
    return null;
  }

  const backend = windowsSensorBackend({
    accelerometer: () => native,
    gyroscope: () => ({
      minimumReportInterval: 0,
      reportInterval: 0,
      getCurrentReading: () => ({
        angularVelocityX: 180,
        angularVelocityY: 0,
        angularVelocityZ: 90
      }),
      onReadingChanged: () => () => undefined
    }),
    magnetometer: missing,
    absoluteOrientation: missing,
    relativeOrientation: missing,
    ambientLight: missing,
    barometer: missing,
    altimeter: missing,
    compass: missing
  });
  assert.equal(backend.isAvailable(SensorKind.ACCELEROMETER), true);
  assert.equal(backend.isAvailable(SensorKind.COMPASS), false);
  assert.equal(backend.open(SensorKind.COMPASS), null);
  const acceleration = backend.open(SensorKind.ACCELEROMETER);
  assert.deepEqual(acceleration?.read(), {
    x: 9.80665,
    y: 0,
    z: -9.80665
  });
  acceleration?.setIntervalMilliseconds(5);
  assert.equal(native.reportInterval, 16);
  acceleration?.setIntervalMilliseconds(100);
  assert.equal(native.reportInterval, 100);
  const rotation = backend.open(SensorKind.GYROSCOPE)?.read();
  assert.ok(rotation);
  assert.ok(Math.abs(rotation.x - Math.PI) < 1e-9);
  assert.ok(Math.abs(rotation.z - Math.PI / 2) < 1e-9);
});
