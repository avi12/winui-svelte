import type { DeviceChooser } from "./device-grants.ts";
import type { Uuid } from "#src/devices/bluetooth.js";
import assert from "node:assert/strict";
// Web Bluetooth over a stand-in for the Windows backend: the options rules,
// the chooser seam, filters, the permission, GATT access rules, reads, writes,
// notifications, descriptors, disconnects and advertisements. No radio and no
// UI: the chooser is a function the test gives.
import { test } from "node:test";

const { Bluetooth, BluetoothAdvertisingEvent, BluetoothDevice, BluetoothUUID, installBluetooth } = await import("./bluetooth.ts");
const { BluetoothFailure } = await import("./bluetooth-backend.ts");
const { installPermissions, Permissions } = await import("./permissions.ts");

type Backend = NonNullable<Parameters<typeof installBluetooth>[0]>["backend"];
type Candidate = Awaited<ReturnType<NonNullable<Backend>["discover"]>>[number];

const BATTERY = "0000180f-0000-1000-8000-00805f9b34fb";
const LEVEL = "00002a19-0000-1000-8000-00805f9b34fb";
const CCC = "00002902-0000-1000-8000-00805f9b34fb";
const LOCKED = "00002a1a-0000-1000-8000-00805f9b34fb";
const HEART = "0000180d-0000-1000-8000-00805f9b34fb";

function candidateOf({ id, name, serviceUuids = [], companyId }: {
  id: string;
  name: string;
  serviceUuids?: Uuid[];
  companyId?: number;
}) {
  return {
    id,
    address: BigInt(`0x${id.replaceAll(":", "")}`),
    name,
    advertisement: {
      address: 0n,
      addressText: id,
      localName: name,
      serviceUuids,
      manufacturerData: companyId === undefined ? [] : [{
        companyId,
        data: Uint8Array.of(1, 2, 3)
      }],
      dataSections: [],
      rssi: -50,
      transmitPower: null,
      timestamp: new Date(0),
      type: 0,
      isConnectable: true,
      isScannable: false,
      isDirected: false,
      isScanResponse: false,
      isAnonymous: false
    }
  } satisfies Candidate;
}

function isWanted({ wanted, uuid }: {
  wanted: string | undefined;
  uuid: string;
}) {
  return wanted === undefined || wanted === uuid;
}

function fakeBackend({ isAvailable = true } = {}) {
  const log: string[] = [];
  const candidates = [
    candidateOf({
      id: "AA:00:00:00:00:01",
      name: "Heart Strap",
      serviceUuids: [HEART]
    }),
    candidateOf({
      id: "AA:00:00:00:00:02",
      name: "Battery Pack",
      serviceUuids: [BATTERY],
      companyId: 0x4C
    }),
    candidateOf({
      id: "AA:00:00:00:00:03",
      name: ""
    })
  ];
  let written: Uint8Array | undefined;
  let emit: ((value: Uint8Array) => void) | undefined;
  let disconnected: (() => void) | undefined;
  let advertise: ((advertisement: Candidate["advertisement"]) => void) | undefined;
  let watchSignal: AbortSignal | undefined;
  const descriptorWrites: Uint8Array[] = [];
  const descriptor = {
    uuid: CCC,
    read: () => Promise.resolve(Uint8Array.of(0, 0)),
    write(value: Uint8Array) {
      descriptorWrites.push(value);
      return Promise.resolve();
    }
  };
  const level = {
    uuid: LEVEL,
    flags: {
      broadcast: false,
      read: true,
      writeWithoutResponse: true,
      write: true,
      notify: true,
      indicate: false,
      authenticatedSignedWrites: false,
      reliableWrite: false,
      writableAuxiliaries: false
    },
    read: () => Promise.resolve(Uint8Array.of(87)),
    write({ value, isWithoutResponse }: {
      value: Uint8Array;
      isWithoutResponse: boolean;
    }) {
      written = value;
      log.push(`write ${isWithoutResponse}`);
      return Promise.resolve();
    },
    startNotifications(onValue: (value: Uint8Array) => void) {
      emit = onValue;
      log.push("notify on");
      return Promise.resolve(() => {
        emit = undefined;
        log.push("notify off");
        return Promise.resolve();
      });
    },
    descriptors: (uuid?: string) => Promise.resolve(
      [descriptor].filter(item => isWanted({
        wanted: uuid,
        uuid: item.uuid
      }))
    )
  };
  const locked = {
    ...level,
    uuid: LOCKED,
    flags: {
      ...level.flags,
      write: false,
      writeWithoutResponse: false,
      notify: false
    }
  };
  const backend = {
    isAvailable: () => Promise.resolve(isAvailable),
    discover: () => Promise.resolve(candidates),
    connect(candidate) {
      log.push(`connect ${candidate.id}`);

      if (candidate.id.endsWith("03")) {
        return Promise.reject(
          new BluetoothFailure({
            message: "out of range",
            kind: "unreachable"
          })
        );
      }

      return Promise.resolve({
        services: (uuid?: string) => Promise.resolve(
          [
            {
              uuid: BATTERY,
              characteristics: (wanted?: string) => Promise.resolve(
                [level, locked].filter(item => isWanted({
                  wanted,
                  uuid: item.uuid
                }))
              )
            },
            {
              uuid: HEART,
              characteristics: () => Promise.resolve([])
            }
          ].filter(service => uuid === undefined || service.uuid === uuid)
        ),
        close: () => log.push("close"),
        onDisconnected(callback: () => void) {
          disconnected = callback;
          return () => {
            disconnected = undefined;
          };
        }
      });
    },
    watch({ onAdvertisement, signal }) {
      advertise = onAdvertisement;
      watchSignal = signal;
    }
  } satisfies NonNullable<Backend>;
  return {
    backend,
    log,
    descriptorWrites,
    get written() {
      return written;
    },
    notify: (value: Uint8Array) => emit?.(value),
    dropLink: () => disconnected?.(),
    advertise: (advertisement: Candidate["advertisement"]) => advertise?.(advertisement),
    get watchSignal() {
      return watchSignal;
    },
    candidates
  };
}

function pickFirst({ candidates }: { candidates: readonly Candidate[] }) {
  return Promise.resolve(candidates.slice(0, 1));
}

async function withBluetooth({ fake = fakeBackend(), chooser = pickFirst, run }: {
  fake?: ReturnType<typeof fakeBackend>;
  chooser?: DeviceChooser<Candidate>;
  run: (fake: ReturnType<typeof fakeBackend>) => Promise<void>;
}) {
  const uninstall = installBluetooth({
    backend: fake.backend,
    chooser
  });
  try {
    await run(fake);
  } finally {
    uninstall();
  }
}

function isDomError(name: string) {
  return (error: unknown) => error instanceof DOMException && error.name === name;
}

test("getAvailability follows the adapter and BluetoothUUID makes full UUIDs", async () => {
  await withBluetooth({
    fake: fakeBackend({ isAvailable: false }),
    async run() {
      assert.ok(navigator.bluetooth instanceof Bluetooth);
      assert.equal(await navigator.bluetooth.getAvailability(), false);
      assert.equal(BluetoothUUID.canonicalUUID(0x180F), BATTERY);
      await assert.rejects(navigator.bluetooth.requestDevice({ acceptAllDevices: true }), isDomError("NotFoundError"));
    }
  });
});

test("requestDevice rejects options the spec rejects", async () => {
  await withBluetooth({
    async run() {
      const bad = [
        {},
        { filters: [] },
        { filters: [{}] },
        { filters: [{ services: [] }] },
        { filters: [{ namePrefix: "" }] },
        {
          filters: [{ name: "x" }],
          acceptAllDevices: true
        },
        {
          acceptAllDevices: true,
          optionalServices: ["nope"]
        }
      ];
      for (const options of bad) {
        await assert.rejects(navigator.bluetooth.requestDevice(options), TypeError);
      }
    }
  });
});

test("requestDevice offers the filtered candidates to the chooser and allows the pick", async () => {
  const offered: string[][] = [];
  await withBluetooth({
    chooser({ candidates }) {
      offered.push(candidates.map(candidate => candidate.id));
      return Promise.resolve(candidates.slice(-1));
    },
    async run() {
      const byService = await navigator.bluetooth.requestDevice({ filters: [{ services: [0x180F] }] });
      assert.equal(byService.id, "AA:00:00:00:00:02");
      assert.equal(byService.name, "Battery Pack");
      assert.equal(byService.address, "AA:00:00:00:00:02");
      await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: "Heart" }, { name: "Battery Pack" }] });
      await navigator.bluetooth.requestDevice({
        filters: [{
          manufacturerData: [{
            companyIdentifier: 0x4C,
            dataPrefix: Uint8Array.of(1, 2)
          }]
        }]
      });
      await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        exclusionFilters: [{ namePrefix: "Heart" }]
      });
      assert.deepEqual(offered, [
        ["AA:00:00:00:00:02"],
        ["AA:00:00:00:00:01", "AA:00:00:00:00:02"],
        ["AA:00:00:00:00:02"],
        ["AA:00:00:00:00:02", "AA:00:00:00:00:03"]
      ]);
      const devices = await navigator.bluetooth.getDevices();
      assert.deepEqual(devices.map(device => device.id).sort(), ["AA:00:00:00:00:02", "AA:00:00:00:00:03"]);
    }
  });
});

test("requestDevice without a chooser is NotAllowedError, with an empty answer NotFoundError; a per-call chooser wins", async () => {
  const fake = fakeBackend();
  const uninstall = installBluetooth({ backend: fake.backend });
  await assert.rejects(navigator.bluetooth.requestDevice({ acceptAllDevices: true }), isDomError("NotAllowedError"));
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    chooser: pickFirst
  });
  assert.equal(device.id, "AA:00:00:00:00:01");
  await assert.rejects(
    navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      chooser: () => Promise.resolve([])
    }),
    isDomError("NotFoundError")
  );
  uninstall();
});

test("the Permissions API says prompt, then granted after a pick, then prompt after forget", async () => {
  const uninstallPermissions = installPermissions();
  await withBluetooth({
    async run() {
      const status = await new Permissions().query({ name: "bluetooth" });
      assert.equal(status.state, "prompt");
      const changes: string[] = [];
      status.addEventListener("change", () => changes.push(status.state));
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      await device.forget();
      assert.deepEqual(changes, ["granted", "prompt"]);
      assert.deepEqual(await navigator.bluetooth.getDevices(), []);
    }
  });
  uninstallPermissions();
});

test("the same device is the same object each time", async () => {
  await withBluetooth({
    async run() {
      const first = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      const second = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      assert.equal(first, second);
      assert.ok(first instanceof BluetoothDevice);
      assert.equal((await navigator.bluetooth.getDevices())[0], first);
    }
  });
});

test("GATT: services outside the request are a SecurityError, missing ones NotFoundError, a closed link NetworkError", async () => {
  await withBluetooth({
    chooser: ({ candidates }) => Promise.resolve(candidates.filter(candidate => candidate.id.endsWith("02"))),
    async run(fake) {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [0x180F] }],
        optionalServices: [0x180D]
      });
      assert.equal(device.gatt.connected, false);
      await assert.rejects(device.gatt.getPrimaryService(BATTERY), isDomError("NetworkError"));
      assert.equal(await device.gatt.connect(), device.gatt);
      assert.equal(device.gatt.connected, true);
      assert.equal((await device.gatt.getPrimaryService(0x180F)).uuid, BATTERY);
      await assert.rejects(device.gatt.getPrimaryService(0x1800), isDomError("SecurityError"));
      const all = await device.gatt.getPrimaryServices();
      assert.deepEqual(all.map(service => service.uuid), [BATTERY, HEART]);
      assert.equal(fake.log.filter(entry => entry.startsWith("connect")).length, 1);
    }
  });
});

test("GATT: a link that cannot be made is NetworkError, and connect shares one attempt", async () => {
  await withBluetooth({
    chooser: ({ candidates }) => Promise.resolve(candidates.slice(2, 3)),
    async run(fake) {
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      await assert.rejects(device.gatt.connect(), isDomError("NetworkError"));
      assert.equal(device.gatt.connected, false);
      await assert.rejects(Promise.all([device.gatt.connect(), device.gatt.connect()]), isDomError("NetworkError"));
      assert.equal(fake.log.filter(entry => entry.startsWith("connect")).length, 2);
    }
  });
});

test("characteristics read, write and describe", async () => {
  await withBluetooth({
    chooser: ({ candidates }) => Promise.resolve(candidates.filter(candidate => candidate.id.endsWith("02"))),
    async run(fake) {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [0x180F] }] });
      await device.gatt.connect();
      const service = await device.gatt.getPrimaryService(0x180F);
      const characteristic = await service.getCharacteristic(0x2A19);
      assert.equal(characteristic.properties.notify, true);
      assert.equal(characteristic.value === null, true);
      const read = await characteristic.readValue();
      assert.equal(read.getUint8(0), 87);
      assert.equal(characteristic.value, read);
      await characteristic.writeValue(Uint8Array.of(5));
      await characteristic.writeValueWithoutResponse(Uint8Array.of(6));
      assert.deepEqual(fake.log.filter(entry => entry.startsWith("write")), ["write false", "write true"]);
      assert.deepEqual([...fake.written ?? []], [6]);
      await assert.rejects(service.getCharacteristic(0x2A00), isDomError("NotFoundError"));
      assert.equal((await service.getCharacteristics()).length, 2);
      const descriptor = await characteristic.getDescriptor(0x2902);
      assert.equal((await descriptor.readValue()).byteLength, 2);
      await descriptor.writeValue(Uint8Array.of(1, 0));
      assert.deepEqual(fake.descriptorWrites.map(value => [...value]), [[1, 0]]);
      await assert.rejects(characteristic.getDescriptor(0x2901), isDomError("NotFoundError"));
    }
  });
});

test("a characteristic that cannot do a thing says NotSupportedError", async () => {
  const fake = fakeBackend();
  await withBluetooth({
    fake,
    chooser: ({ candidates }) => Promise.resolve(candidates.filter(candidate => candidate.id.endsWith("02"))),
    async run() {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [0x180F] }] });
      await device.gatt.connect();
      const service = await device.gatt.getPrimaryService(0x180F);
      const characteristic = await service.getCharacteristic(0x2A1A);
      assert.equal(characteristic.properties.write, false);
      await assert.rejects(characteristic.writeValueWithoutResponse(Uint8Array.of(1)), isDomError("NotSupportedError"));
      await assert.rejects(characteristic.writeValue(Uint8Array.of(1)), isDomError("NotSupportedError"));
      await assert.rejects(characteristic.startNotifications(), isDomError("NotSupportedError"));
    }
  });
});

test("notifications raise characteristicvaluechanged on the characteristic, service and device, until stopped", async () => {
  await withBluetooth({
    chooser: ({ candidates }) => Promise.resolve(candidates.filter(candidate => candidate.id.endsWith("02"))),
    async run(fake) {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [0x180F] }] });
      await device.gatt.connect();
      const service = await device.gatt.getPrimaryService(0x180F);
      const characteristic = await service.getCharacteristic(0x2A19);
      const seen: string[] = [];
      characteristic.addEventListener("characteristicvaluechanged", () => seen.push(`characteristic ${characteristic.value?.getUint8(0)}`));
      service.oncharacteristicvaluechanged = () => seen.push("service");
      device.addEventListener("characteristicvaluechanged", event => seen.push(`device ${event.target === device}`));
      assert.equal(await characteristic.startNotifications(), characteristic);
      await characteristic.startNotifications();
      fake.notify(Uint8Array.of(42));
      assert.deepEqual(seen, ["characteristic 42", "service", "device true"]);
      await characteristic.stopNotifications();
      fake.notify(Uint8Array.of(43));
      assert.equal(seen.length, 3);
      assert.deepEqual(fake.log.filter(entry => entry.startsWith("notify")), ["notify on", "notify off"]);
    }
  });
});

test("disconnect() and a lost link both fire gattserverdisconnected once and end the notifications' use", async () => {
  await withBluetooth({
    chooser: ({ candidates }) => Promise.resolve(candidates.filter(candidate => candidate.id.endsWith("02"))),
    async run(fake) {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [0x180F] }] });
      let count = 0;
      device.ongattserverdisconnected = () => {
        count += 1;
      };
      device.gatt.disconnect();
      assert.equal(count, 0);
      await device.gatt.connect();
      device.gatt.disconnect();
      assert.equal(count, 1);
      assert.equal(fake.log.includes("close"), true);
      await device.gatt.connect();
      fake.dropLink();
      assert.equal(count, 2);
      assert.equal(device.gatt.connected, false);
      await assert.rejects(device.gatt.getPrimaryService(0x180F), isDomError("NetworkError"));
    }
  });
});

test("watchAdvertisements delivers advertisementreceived until the signal aborts", async () => {
  await withBluetooth({
    async run(fake) {
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      const controller = new AbortController();
      const events: {
        name: string | null;
        rssi: number;
        company: number | undefined;
      }[] = [];
      device.onadvertisementreceived = event => {
        assert.ok(event instanceof BluetoothAdvertisingEvent);
        events.push({
          name: event.name,
          rssi: event.rssi,
          company: [...event.manufacturerData.keys()][0]
        });
      };
      await device.watchAdvertisements({ signal: controller.signal });
      assert.equal(device.watchingAdvertisements, true);
      fake.advertise(
        candidateOf({
          id: "AA:00:00:00:00:01",
          name: "Heart Strap",
          companyId: 0x4C
        }).advertisement
      );
      assert.deepEqual(events, [{
        name: "Heart Strap",
        rssi: -50,
        company: 0x4C
      }]);
      controller.abort();
      assert.equal(fake.watchSignal?.aborted, true);
      assert.equal(device.watchingAdvertisements, false);
    }
  });
});

test("uninstalling disconnects the open devices and removes navigator.bluetooth", async () => {
  const fake = fakeBackend();
  const uninstall = installBluetooth({
    backend: fake.backend,
    chooser: pickFirst
  });
  const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
  await device.gatt.connect();
  uninstall();
  assert.equal(device.gatt.connected, false);
  assert.equal("bluetooth" in navigator, false);
});
