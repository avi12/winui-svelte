import assert from "node:assert/strict";
import { test } from "node:test";

// navigator.getBattery over a stand-in power source: the standard values on
// a laptop and on a desktop without a battery, the four events, and the
// WinUI extras.

const { BatteryStatus, EnergySaverStatus, PowerSupplyStatus } = await import("#src/devices/power.js");
const { BatteryManager, installBattery } = await import("./battery.ts");

type Reading = Parameters<InstanceType<typeof BatteryManager>["update"]>[0];

const LAPTOP = {
  batteryStatus: BatteryStatus.Discharging,
  remainingChargePercent: 80,
  powerSupplyStatus: PowerSupplyStatus.NotPresent,
  energySaverStatus: EnergySaverStatus.Off,
  remainingDischargeMilliseconds: 5_400_000,
  chargeRateMilliwatts: -9000,
  designCapacityMilliwattHours: 50_000,
  fullChargeCapacityMilliwattHours: 40_000,
  remainingCapacityMilliwattHours: 32_000
} satisfies Reading;

function fakeSource(first: Reading) {
  let reading = first;
  let notify: (() => void) | undefined;
  let stops = 0;
  return {
    source: {
      read: () => reading,
      subscriptions: [
        (callback: () => void) => {
          notify = callback;
          return () => {
            stops += 1;
          };
        }
      ]
    },
    change(next: Reading) {
      reading = next;
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

test("a laptop on battery reports the standard values", async () => {
  const fake = fakeSource(LAPTOP);
  const uninstall = installBattery({
    source: fake.source,
    deliver: immediately
  });
  const manager = await navigator.getBattery();
  assert.equal(manager.charging, false);
  assert.equal(manager.level, 0.8);
  assert.equal(manager.dischargingTime, 5400);
  assert.equal(manager.chargingTime, Infinity);
  assert.equal(await navigator.getBattery(), manager);
  uninstall();
});

test("a desktop with no battery is charging at full level", async () => {
  const fake = fakeSource({
    ...LAPTOP,
    batteryStatus: BatteryStatus.NotPresent,
    remainingChargePercent: 100,
    remainingDischargeMilliseconds: null,
    chargeRateMilliwatts: null,
    designCapacityMilliwattHours: null,
    fullChargeCapacityMilliwattHours: null,
    remainingCapacityMilliwattHours: null
  });
  const uninstall = installBattery({
    source: fake.source,
    deliver: immediately
  });
  const manager = await navigator.getBattery();
  assert.equal(manager.charging, true);
  assert.equal(manager.level, 1);
  assert.equal(manager.chargingTime, Infinity);
  assert.equal(manager.dischargingTime, Infinity);
  assert.equal(manager.hasBattery, false);
  uninstall();
});

test("charging time comes from the capacity and the charge rate", async () => {
  const fake = fakeSource({
    ...LAPTOP,
    batteryStatus: BatteryStatus.Charging,
    powerSupplyStatus: PowerSupplyStatus.Adequate,
    chargeRateMilliwatts: 8000,
    remainingDischargeMilliseconds: null
  });
  const uninstall = installBattery({
    source: fake.source,
    deliver: immediately
  });
  const manager = await navigator.getBattery();
  assert.equal(manager.charging, true);
  assert.equal(manager.chargingTime, 3600);
  assert.equal(manager.dischargingTime, Infinity);
  uninstall();
});

test("the four events fire for what changed, handlers and listeners alike", async () => {
  const fake = fakeSource(LAPTOP);
  const uninstall = installBattery({
    source: fake.source,
    deliver: immediately
  });
  const manager = await navigator.getBattery();
  const seen: string[] = [];
  manager.onchargingchange = () => seen.push("handler:chargingchange");
  for (const type of ["chargingtimechange", "dischargingtimechange", "levelchange"]) {
    manager.addEventListener(type, () => seen.push(type));
  }

  fake.change({
    ...LAPTOP,
    remainingChargePercent: 79
  });
  assert.deepEqual(seen, ["levelchange"]);
  seen.length = 0;
  fake.change({
    ...LAPTOP,
    remainingChargePercent: 79,
    batteryStatus: BatteryStatus.Charging,
    powerSupplyStatus: PowerSupplyStatus.Adequate,
    remainingDischargeMilliseconds: null,
    chargeRateMilliwatts: 8000
  });
  assert.deepEqual(seen, ["handler:chargingchange", "chargingtimechange", "dischargingtimechange"]);
  uninstall();
});

test("the WinUI extras read the report", async () => {
  const fake = fakeSource({
    ...LAPTOP,
    energySaverStatus: EnergySaverStatus.On
  });
  const uninstall = installBattery({
    source: fake.source,
    deliver: immediately
  });
  const manager = await navigator.getBattery();
  assert.equal(manager.isEnergySaverOn, true);
  assert.equal(manager.hasBattery, true);
  assert.equal(manager.chargeRateMilliwatts, -9000);
  assert.equal(manager.designCapacityMilliwattHours, 50_000);
  assert.equal(manager.fullChargeCapacityMilliwattHours, 40_000);
  assert.equal(manager.remainingCapacityMilliwattHours, 32_000);
  uninstall();
});

test("nothing listens before getBattery, and uninstall stops it", async () => {
  const fake = fakeSource(LAPTOP);
  const uninstall = installBattery({
    source: fake.source,
    deliver: immediately
  });
  assert.equal(fake.stops, 0);
  await navigator.getBattery();
  uninstall();
  assert.equal(fake.stops, 1);
  assert.equal("getBattery" in navigator, false);
  assert.equal("BatteryManager" in globalThis, false);
});
