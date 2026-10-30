import {
  BluetoothLEAdvertisementType,
  BluetoothLEAdvertisementWatcherStatus,
  BluetoothLEScanningMode,
  GattClientCharacteristicConfigurationDescriptorValue,
  GattCommunicationStatus
} from "./bindings.ts";
import { addressOfText, addressText } from "./bluetooth-address.ts";
import type { AdvertisementWatcherSource, ReceivedAdvertisementLike } from "./bluetooth-advertisements.ts";
import {
  advertisementOf,
  BluetoothScanAbortedError,
  passesFilter,
  scanBluetoothAdvertisements
} from "./bluetooth-advertisements.ts";
import type { NotifyingCharacteristic } from "./bluetooth-gatt.ts";
import { BluetoothLowEnergyError, characteristicValues, subscribeToCharacteristic } from "./bluetooth-gatt.ts";
import { isUuid, shortIdOfUuid, uuidOf, uuidOfShortId } from "./bluetooth-uuid.ts";
import { bufferOf, bytesOf } from "./buffers.ts";
import { roInitialize } from "@microsoft/dynwinrt";
import "#src/state/test-support/svelte-runes.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// Bluetooth LE without a radio: addresses, UUIDs, an advertisement read into
// plain values, the scan as a stream and as a collection, and a
// characteristic's notifications, on stand-ins for the watcher and the
// characteristic. Buffers and UUID helpers are the real WinRT ones.

roInitialize();

const { flushSync } = await import("svelte");
const { track } = await import("#src/state/test-support/track.svelte.js");
const { bluetoothScanner } = await import("./bluetooth-scanner.svelte.ts");

const ADDRESS = 0xAABBCCDDEEFFn;
const BATTERY_SERVICE = 0x180F;
const COMPANY_APPLE = 0x004C;
const RSSI = -60;
const WEAK_RSSI = -90;
const TIMESTAMP_TICKS = 134_000_000_000_000_000n;
const BATTERY_LEVEL = 87;

function received({ address = ADDRESS, name = "Sensor", rssi = RSSI }: {
  address?: bigint;
  name?: string;
  rssi?: number;
} = {}) {
  return {
    bluetoothAddress: address,
    rawSignalStrengthInDBm: rssi,
    transmitPowerLevelInDBm: null,
    timestamp: {
      universalTime: TIMESTAMP_TICKS
    },
    advertisementType: BluetoothLEAdvertisementType.ConnectableUndirected,
    isConnectable: true,
    isScannable: false,
    isDirected: false,
    isScanResponse: false,
    isAnonymous: false,
    advertisement: {
      localName: name,
      serviceUuids: ["0000180f-0000-1000-8000-00805f9b34fb"],
      manufacturerData: [{
        companyId: COMPANY_APPLE,
        data: bufferOf(new Uint8Array([1, 2, 3]))
      }],
      dataSections: [{
        dataType: 9,
        data: bufferOf(new TextEncoder().encode(name))
      }]
    }
  } satisfies ReceivedAdvertisementLike;
}

class FakeScan implements AdvertisementWatcherSource {
  status: BluetoothLEAdvertisementWatcherStatus = BluetoothLEAdvertisementWatcherStatus.Created;
  scanningMode: BluetoothLEScanningMode = BluetoothLEScanningMode.Active;
  stopCount = 0;
  private readonly receivers = new Set<(sender: unknown, received: ReceivedAdvertisementLike) => void>();
  private readonly stoppers = new Set<() => void>();

  get listenerCount() {
    return this.receivers.size + this.stoppers.size;
  }

  start() {
    this.status = BluetoothLEAdvertisementWatcherStatus.Started;
  }

  stop() {
    this.stopCount++;
    this.status = BluetoothLEAdvertisementWatcherStatus.Stopped;
  }

  onReceived(callback: (sender: unknown, received: ReceivedAdvertisementLike) => void) {
    this.receivers.add(callback);
    return () => {
      this.receivers.delete(callback);
    };
  }

  onStopped(callback: () => void) {
    this.stoppers.add(callback);
    return () => {
      this.stoppers.delete(callback);
    };
  }

  hear(advertisement: ReceivedAdvertisementLike) {
    for (const receiver of this.receivers) {
      receiver(this, advertisement);
    }
  }

  abort() {
    this.status = BluetoothLEAdvertisementWatcherStatus.Aborted;
    for (const stopper of this.stoppers) {
      stopper();
    }
  }
}

test("an address reads as six hex bytes and parses back", () => {
  assert.equal(addressText(ADDRESS), "AA:BB:CC:DD:EE:FF");
  assert.equal(addressOfText("AA:BB:CC:DD:EE:FF"), ADDRESS);
  assert.equal(addressOfText("aa:bb:cc:dd:ee:ff"), ADDRESS);
  assert.throws(() => addressOfText("AABBCCDDEEFF"), TypeError);
});

test("UUIDs normalize, and short ids map to the Bluetooth base UUID", () => {
  assert.equal(uuidOf("{0000180F-0000-1000-8000-00805F9B34FB}"), "0000180f-0000-1000-8000-00805f9b34fb");
  assert.equal(isUuid("0000180f-0000-1000-8000-00805f9b34fb"), true);
  assert.equal(isUuid("battery"), false);
  assert.throws(() => uuidOf("battery"), TypeError);
  const battery = uuidOfShortId(BATTERY_SERVICE);
  assert.equal(battery, "0000180f-0000-1000-8000-00805f9b34fb");
  assert.equal(shortIdOfUuid(battery), BATTERY_SERVICE);
  assert.equal(shortIdOfUuid("12345678-1234-1234-1234-123456789abc"), null);
});

test("an advertisement is read into plain values", () => {
  const advertisement = advertisementOf(received());
  assert.equal(advertisement.addressText, "AA:BB:CC:DD:EE:FF");
  assert.equal(advertisement.localName, "Sensor");
  assert.deepEqual(advertisement.serviceUuids, ["0000180f-0000-1000-8000-00805f9b34fb"]);
  assert.equal(advertisement.manufacturerData[0]?.companyId, COMPANY_APPLE);
  assert.deepEqual([...advertisement.manufacturerData[0]?.data ?? []], [1, 2, 3]);
  assert.equal(new TextDecoder().decode(advertisement.dataSections[0]?.data), "Sensor");
  assert.equal(advertisement.rssi, RSSI);
  assert.ok(advertisement.timestamp instanceof Date);
  assert.equal(advertisement.isConnectable, true);
});

test("a filter keeps what matches every part it names", () => {
  const advertisement = advertisementOf(received());
  assert.equal(
    passesFilter({
      advertisement,
      filter: {}
    }), true
  );
  assert.equal(
    passesFilter({
      advertisement,
      filter: {
        localName: "sens",
        serviceUuids: [uuidOfShortId(BATTERY_SERVICE)],
        companyId: COMPANY_APPLE,
        minimumRssi: WEAK_RSSI
      }
    }), true
  );
  assert.equal(
    passesFilter({
      advertisement,
      filter: {
        localName: "lock"
      }
    }), false
  );
  assert.equal(
    passesFilter({
      advertisement,
      filter: {
        minimumRssi: -40
      }
    }), false
  );
  assert.equal(
    passesFilter({
      advertisement,
      filter: {
        companyId: 1
      }
    }), false
  );
});

test("the scan is a stream that ends with the loop and lets go of the watcher", async () => {
  const scan = new FakeScan();
  const heard: string[] = [];
  const stream = scanBluetoothAdvertisements({
    createSource: () => scan,
    filter: {
      minimumRssi: WEAK_RSSI
    }
  });
  const reading = (async () => {
    for await (const advertisement of stream) {
      heard.push(advertisement.localName);

      const hasTwo = heard.length === 2;
      if (hasTwo) {
        break;
      }
    }
  })();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(scan.scanningMode, BluetoothLEScanningMode.Passive, "passive unless asked");
  scan.hear(received({ name: "A" }));
  scan.hear(
    received({
      name: "Faint",
      rssi: -100
    })
  );
  scan.hear(received({ name: "B" }));
  await reading;
  assert.deepEqual(heard, ["A", "B"]);
  assert.equal(scan.stopCount, 1);
  assert.equal(scan.listenerCount, 0);
});

test("a signal aborts the scan stream, and a system abort throws", async () => {
  const controller = new AbortController();
  const scan = new FakeScan();
  const stream = scanBluetoothAdvertisements({
    createSource: () => scan,
    signal: controller.signal
  });
  const reading = (async () => {
    const heard: string[] = [];
    for await (const advertisement of stream) {
      heard.push(advertisement.localName);
    }

    return heard;
  })();
  await new Promise(resolve => setImmediate(resolve));
  scan.hear(received({ name: "A" }));
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  assert.deepEqual(await reading, ["A"]);

  const failing = new FakeScan();
  const failed = (async () => {
    for await (const advertisement of scanBluetoothAdvertisements({ createSource: () => failing })) {
      assert.fail(`nothing was heard but got ${advertisement.localName}`);
    }
  })();
  await new Promise(resolve => setImmediate(resolve));
  failing.abort();
  await assert.rejects(failed, BluetoothScanAbortedError);
});

test("the scanner collection keeps the latest advertisement of each device", () => {
  const scan = new FakeScan();
  let scanner: ReturnType<typeof bluetoothScanner> | undefined;
  const scope = track(() => {
    scanner = bluetoothScanner({
      createSource: () => scan,
      deliver(work) {
        work();
        flushSync();
      }
    });
  });
  const current = scanner;
  assert.ok(current);
  assert.equal(current.isScanning, false);
  current.start();
  assert.equal(current.isScanning, true);
  scan.hear(received({ name: "First" }));
  scan.hear(
    received({
      address: 0x112233445566n,
      name: "Other"
    })
  );
  scan.hear(received({ name: "Renamed" }));
  assert.deepEqual(current.advertisements.keys, ["AA:BB:CC:DD:EE:FF", "11:22:33:44:55:66"]);
  assert.equal(current.advertisements.get("AA:BB:CC:DD:EE:FF")?.localName, "Renamed");
  scan.abort();
  assert.equal(current.error?.name, "BluetoothScanAbortedError");
  scope.stop();
  flushSync();
  assert.equal(scan.listenerCount, 0);
});

type ValueListener = (sender: unknown, args: { readonly characteristicValue: ReturnType<typeof bufferOf> }) => void;

class FakeCharacteristic implements NotifyingCharacteristic {
  readonly written: GattClientCharacteristicConfigurationDescriptorValue[] = [];
  status: GattCommunicationStatus = GattCommunicationStatus.Success;
  private readonly listeners = new Set<ValueListener>();

  get listenerCount() {
    return this.listeners.size;
  }

  writeClientCharacteristicConfigurationDescriptorAsync(value: GattClientCharacteristicConfigurationDescriptorValue) {
    this.written.push(value);
    return Promise.resolve(this.status);
  }

  onValueChanged(callback: ValueListener) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  notify(bytes: number[]) {
    for (const listener of this.listeners) {
      listener(this, { characteristicValue: bufferOf(new Uint8Array(bytes)) });
    }
  }
}

test("a subscription turns notifications on, delivers the bytes and turns them off", async () => {
  const characteristic = new FakeCharacteristic();
  const values: number[][] = [];
  const stop = await subscribeToCharacteristic({
    characteristic,
    onValue: value => values.push([...value])
  });
  characteristic.notify([BATTERY_LEVEL]);
  assert.deepEqual(values, [[BATTERY_LEVEL]]);
  await stop();
  assert.deepEqual(characteristic.written, [
    GattClientCharacteristicConfigurationDescriptorValue.Notify,
    GattClientCharacteristicConfigurationDescriptorValue.None
  ]);
  assert.equal(characteristic.listenerCount, 0);
});

test("a device that refuses notifications throws with the GATT status", async () => {
  const characteristic = new FakeCharacteristic();
  characteristic.status = GattCommunicationStatus.AccessDenied;
  await assert.rejects(
    subscribeToCharacteristic({
      characteristic,
      onValue() {}
    }),
    (error: unknown) => {
      const isGattError = error instanceof BluetoothLowEnergyError;
      return isGattError && error.status === GattCommunicationStatus.AccessDenied;
    }
  );
  assert.equal(characteristic.listenerCount, 0);
});

test("the notifications are a stream that ends with its signal", async () => {
  const characteristic = new FakeCharacteristic();
  const controller = new AbortController();
  const reading = (async () => {
    const levels: number[] = [];
    for await (const value of characteristicValues({
      characteristic,
      signal: controller.signal
    })) {
      levels.push(...value);
    }

    return levels;
  })();
  await new Promise(resolve => setImmediate(resolve));
  characteristic.notify([1]);
  characteristic.notify([2]);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  assert.deepEqual(await reading, [1, 2]);
  assert.equal(characteristic.listenerCount, 0);
  assert.equal(characteristic.written.at(-1), GattClientCharacteristicConfigurationDescriptorValue.None);
});

test("bytes survive the trip through a WinRT buffer", () => {
  assert.deepEqual([...bytesOf(bufferOf(new Uint8Array([9, 8, 7])))], [9, 8, 7]);
});
