import {
  BatteryStatus,
  EnergySaverStatus,
  NetworkConnectivityLevel,
  NetworkCostType,
  PowerSupplyStatus
} from "./bindings.ts";
import type { NetworkReading } from "./network-information.svelte.ts";
import type { PowerReading } from "./power.svelte.ts";
import type { PrinterRecord } from "./printer-source.ts";
import { PrinterAttribute, PrinterStatus } from "./printer-source.ts";
import { FakeInformation, FakeWatcher } from "./test-support/fake-watcher.ts";
import "#src/state/test-support/svelte-runes.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The runes that read a value and re-read it when a native event fires, on
// stand-in sources: a read inside an effect subscribes, an event re-runs the
// effect with the new value, and an ended effect lets go of the event.

const { flushSync, tick } = await import("svelte");
const { track } = await import("#src/state/test-support/track.svelte.js");
const { battery } = await import("./power.svelte.ts");
const { networkInformation } = await import("./network-information.svelte.ts");
const { printers } = await import("./printers.svelte.ts");
const { audioDevices } = await import("./audio-devices.svelte.ts");
const { gamepads } = await import("./gamepads.svelte.ts");
const { displays } = await import("./displays.svelte.ts");
const { lightSensor } = await import("./sensors.svelte.ts");
const { inputDevices } = await import("./input-devices.svelte.ts");

const WORK_PERCENT = 80;
const HEALTHY_PERCENT = 90;
const DESIGN_CAPACITY = 50_000;
const FULL_CAPACITY = 45_000;
const LUX = 320;
const MILLISECONDS_PER_MINUTE = 60_000;

function deliver(work: () => void) {
  work();
  flushSync();
}

// A source of change a test fires by hand.
class Trigger {
  private readonly listeners = new Set<() => void>();

  get listenerCount() {
    return this.listeners.size;
  }

  subscription = (notify: () => void) => {
    this.listeners.add(notify);
    return () => {
      this.listeners.delete(notify);
    };
  };

  fire() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

test("the battery reads live and follows a change in the power state", async () => {
  const trigger = new Trigger();
  let reading: PowerReading = {
    batteryStatus: BatteryStatus.Discharging,
    remainingChargePercent: WORK_PERCENT,
    powerSupplyStatus: PowerSupplyStatus.NotPresent,
    energySaverStatus: EnergySaverStatus.Off,
    remainingDischargeMilliseconds: MILLISECONDS_PER_MINUTE,
    chargeRateMilliwatts: -1,
    designCapacityMilliwattHours: DESIGN_CAPACITY,
    fullChargeCapacityMilliwattHours: FULL_CAPACITY,
    remainingCapacityMilliwattHours: FULL_CAPACITY
  };
  const power = battery({
    source: {
      read: () => reading,
      subscriptions: [trigger.subscription]
    },
    deliver
  });
  assert.equal(power.hasBattery, true);
  assert.equal(power.healthPercent, HEALTHY_PERCENT);
  assert.equal(trigger.listenerCount, 0, "reading outside an effect subscribes to nothing");

  const charging = track(() => power.isCharging);
  const percent = track(() => power.percent);
  assert.equal(trigger.listenerCount, 1, "the effects share one subscription");
  reading = {
    ...reading,
    batteryStatus: BatteryStatus.Charging,
    remainingChargePercent: 100,
    powerSupplyStatus: PowerSupplyStatus.Adequate
  };
  trigger.fire();
  assert.deepEqual(charging.values, [false, true]);
  assert.deepEqual(percent.values, [WORK_PERCENT, 100]);
  assert.equal(power.isOnAcPower, true);

  charging.stop();
  percent.stop();
  await tick();
  assert.equal(trigger.listenerCount, 0);
});

test("a machine with no battery reports it and no health", () => {
  const power = battery({
    source: {
      read: () => ({
        batteryStatus: BatteryStatus.NotPresent,
        remainingChargePercent: 100,
        powerSupplyStatus: PowerSupplyStatus.Adequate,
        energySaverStatus: EnergySaverStatus.Disabled,
        remainingDischargeMilliseconds: null,
        chargeRateMilliwatts: null,
        designCapacityMilliwattHours: null,
        fullChargeCapacityMilliwattHours: null,
        remainingCapacityMilliwattHours: null
      }),
      subscriptions: []
    },
    deliver
  });
  assert.equal(power.hasBattery, false);
  assert.equal(power.healthPercent, null);
  assert.equal(power.isEnergySaverOn, false);
});

test("the network reports online, metered and the connection name, and follows a status change", () => {
  const trigger = new Trigger();
  const wired: NetworkReading = {
    connectivity: NetworkConnectivityLevel.InternetAccess,
    profileName: "Ethernet",
    costType: NetworkCostType.Unrestricted,
    isRoaming: false,
    isOverDataLimit: false,
    isApproachingDataLimit: false,
    isWifi: false,
    isMobile: false,
    signalBars: null,
    profileNames: ["Ethernet"]
  };
  let reading = wired;
  const network = networkInformation({
    source: {
      read: () => reading,
      subscriptions: [trigger.subscription]
    },
    deliver
  });
  const online = track(() => [network.isOnline, network.isMetered, network.profileName]);
  reading = {
    ...wired,
    connectivity: NetworkConnectivityLevel.LocalAccess,
    costType: NetworkCostType.Variable,
    profileName: "Cafe",
    isWifi: true
  };
  trigger.fire();
  assert.deepEqual(online.values, [[true, false, "Ethernet"], [false, true, "Cafe"]]);
  assert.equal(network.isWifi, true);
  online.stop();
});

test("a printer is offline, paused or faulted by its flags, and the default is marked", () => {
  const base: PrinterRecord = {
    name: "Office",
    serverName: null,
    shareName: null,
    portName: "IP_10.0.0.5",
    driverName: "Driver",
    location: null,
    comment: null,
    attributes: PrinterAttribute.local,
    status: 0,
    jobCount: 0
  };
  const records: PrinterRecord[] = [
    base,
    {
      ...base,
      name: "Label",
      status: PrinterStatus.offline | PrinterStatus.paused
    },
    {
      ...base,
      name: "Jammed",
      status: PrinterStatus.paperJam,
      attributes: PrinterAttribute.network | PrinterAttribute.shared
    },
    {
      ...base,
      name: "Manual",
      attributes: PrinterAttribute.workOffline
    }
  ];
  const watcher = new FakeWatcher();
  const list = printers({
    source: {
      list: () => records,
      defaultName: () => "Label"
    },
    pollMilliseconds: 0,
    createSource: () => watcher,
    deliver
  });
  const [office, label, jammed, manual] = list.printers;
  assert.equal(office?.isOffline, false);
  assert.equal(label?.isOffline, true);
  assert.equal(label?.isPaused, true);
  assert.equal(label?.isDefault, true);
  assert.equal(jammed?.hasError, true);
  assert.equal(jammed?.isNetwork, true);
  assert.equal(jammed?.isShared, true);
  assert.equal(manual?.isOffline, true, "Use Printer Offline counts as offline");
  assert.equal(list.defaultPrinter?.name, "Label");
});

test("printers arriving after the first listing re-read the list", () => {
  const watcher = new FakeWatcher();
  let names = ["Office"];
  const list = printers({
    source: {
      list: () => names.map(name => ({
        name,
        serverName: null,
        shareName: null,
        portName: null,
        driverName: null,
        location: null,
        comment: null,
        attributes: 0,
        status: 0,
        jobCount: 0
      })),
      defaultName: () => null
    },
    pollMilliseconds: 0,
    createSource: () => watcher,
    deliver
  });
  const counted = track(() => list.count);
  watcher.completeEnumeration();
  names = ["Office", "Label"];
  watcher.add(
    new FakeInformation({
      id: "label",
      name: "Label",
      signal: 0
    })
  );
  assert.deepEqual(counted.values.at(-1), 2);
  counted.stop();
});

test("the default audio endpoints follow the system", () => {
  const trigger = new Trigger();
  let outputId = "speakers";
  const audio = audioDevices({
    defaults: {
      read: role => ({
        outputId: `${outputId}${role}`,
        inputId: "microphone"
      }),
      subscriptions: [trigger.subscription]
    },
    createSource: () => new FakeWatcher(),
    deliver
  });
  const seen = track(() => audio.defaultOutputId);
  outputId = "headset";
  trigger.fire();
  assert.deepEqual(seen.values, ["speakers0", "headset0"]);
  assert.equal(audio.communicationsOutputId, "headset1");
  seen.stop();
  audio.outputs.stop();
  audio.inputs.stop();
});

test("gamepads listed follow the added and removed events", () => {
  const trigger = new Trigger();
  let count = 0;
  const pads = gamepads({
    source: {
      list: () => Array.from({ length: count }, () => ({
        isWireless: false,
        read: () => ({
          timestamp: 0n,
          buttons: 0,
          leftTrigger: 0,
          rightTrigger: 0,
          leftThumbstickX: 0,
          leftThumbstickY: 0,
          rightThumbstickX: 0,
          rightThumbstickY: 0
        })
      })),
      subscriptions: [trigger.subscription]
    },
    deliver
  });
  const seen = track(() => pads.gamepads.length);
  count = 2;
  trigger.fire();
  assert.deepEqual(seen.values, [0, 2]);
  seen.stop();
});

test("displays list the areas and mark the primary", () => {
  const area = {
    outerBounds: {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080
    },
    workArea: {
      x: 0,
      y: 0,
      width: 1920,
      height: 1040
    }
  };
  const screens = displays({
    source: {
      list: () => [
        {
          ...area,
          id: 1n,
          isPrimary: true
        },
        {
          ...area,
          id: 2n,
          isPrimary: false
        }
      ],
      subscriptions: []
    },
    deliver
  });
  assert.equal(screens.count, 2);
  assert.equal(screens.primary?.id, 1n);
});

test("a sensor the machine lacks is unavailable and reads null", () => {
  const missing = lightSensor({
    sensor: null,
    deliver
  });
  assert.equal(missing.isAvailable, false);
  assert.equal(missing.reading, null);

  const trigger = new Trigger();
  let lux = LUX;
  const present = lightSensor({
    sensor: {
      getCurrentReading: () => ({ illuminanceInLux: lux }),
      onReadingChanged: trigger.subscription
    },
    deliver
  });
  const seen = track(() => present.reading?.lux);
  lux = 1;
  trigger.fire();
  assert.deepEqual(seen.values, [LUX, 1]);
  seen.stop();
});

test("the input capabilities are read again when an input device comes or goes", () => {
  const watcher = new FakeWatcher();
  let isMousePlugged = false;
  const input = inputDevices({
    source: {
      mouse: () => ({
        isPresent: isMousePlugged,
        buttons: isMousePlugged ? 5 : 0,
        hasVerticalWheel: isMousePlugged,
        hasHorizontalWheel: false,
        hasSwappedButtons: false
      }),
      hasKeyboard: () => true,
      touch: () => ({
        isPresent: false,
        contacts: 0
      }),
      pointerDevices: () => []
    },
    createSource: () => watcher,
    deliver
  });
  const seen = track(() => [input.hasMouse, input.canHover, input.hasWheel]);
  watcher.completeEnumeration();
  isMousePlugged = true;
  watcher.remove("anything");
  assert.deepEqual(seen.values.at(-1), [true, true, true]);
  assert.equal(input.hasKeyboard, true);
  seen.stop();
});
