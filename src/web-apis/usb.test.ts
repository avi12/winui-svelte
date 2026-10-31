import type { DeviceChooser } from "./device-grants.ts";
import type { UsbConnection, UsbDeviceInfo } from "./usb-backend.ts";
// WebUSB over a stand-in for the Windows backend: filters, the chooser seam,
// open and the state rules, claiming, endpoints and transfers, connect and
// disconnect events, and the unsupported calls. No hardware.
import assert from "node:assert/strict";
import { test } from "node:test";

const { installUsb, USB, USBDevice, USBInTransferResult, USBConnectionEvent } = await import("./usb.ts");
const { UsbFailure } = await import("./usb-backend.ts");

type Backend = NonNullable<NonNullable<Parameters<typeof installUsb>[0]>["backend"]>;

function infoOf({ id, vendorId, productId, serialNumber }: {
  id: string;
  vendorId: number;
  productId: number;
  serialNumber?: string;
}) {
  return {
    id,
    vendorId,
    productId,
    usbVersion: 0x0210,
    deviceVersion: 0x0102,
    deviceClass: 0xFF,
    deviceSubclass: 1,
    deviceProtocol: 2,
    productName: `Device ${productId}`,
    ...serialNumber === undefined ? {} : { serialNumber }
  } satisfies UsbDeviceInfo;
}

function bytesOfView(view: DataView | undefined) {
  return view === undefined ? [] : [...new Uint8Array(view.buffer, view.byteOffset, view.byteLength)];
}

function fakeBackend() {
  const present = [
    infoOf({
      id: "usb-a",
      vendorId: 0x1234,
      productId: 1,
      serialNumber: "SN1"
    }),
    infoOf({
      id: "usb-b",
      vendorId: 0x1234,
      productId: 2
    }),
    infoOf({
      id: "usb-c",
      vendorId: 0x4321,
      productId: 3
    })
  ];
  const log: string[] = [];
  let notify: (() => void) | undefined;
  const connection = {
    configurations: [{
      configurationValue: 1,
      interfaces: [{
        interfaceNumber: 0,
        alternates: [
          {
            alternateSetting: 0,
            interfaceClass: 0xFF,
            interfaceSubclass: 0,
            interfaceProtocol: 0,
            endpoints: [
              {
                endpointNumber: 1,
                direction: "in",
                type: "bulk",
                packetSize: 64
              },
              {
                endpointNumber: 2,
                direction: "out",
                type: "bulk",
                packetSize: 64
              },
              {
                endpointNumber: 3,
                direction: "in",
                type: "isochronous",
                packetSize: 64
              }
            ]
          },
          {
            alternateSetting: 1,
            interfaceClass: 0xFF,
            interfaceSubclass: 0,
            interfaceProtocol: 0,
            endpoints: []
          }
        ]
      }]
    }],
    activeConfigurationValue: 1,
    close: () => log.push("close"),
    selectConfiguration(value: number) {
      log.push(`configuration ${value}`);
      return Promise.resolve();
    },
    claimInterface(interfaceNumber: number) {
      log.push(`claim ${interfaceNumber}`);
      return Promise.resolve();
    },
    releaseInterface(interfaceNumber: number) {
      log.push(`release ${interfaceNumber}`);
      return Promise.resolve();
    },
    selectAlternate({ interfaceNumber, alternateSetting }: {
      interfaceNumber: number;
      alternateSetting: number;
    }) {
      log.push(`alternate ${interfaceNumber}/${alternateSetting}`);
      return Promise.resolve();
    },
    controlTransfer({ direction, setup, length, data }: Parameters<UsbConnection["controlTransfer"]>[0]) {
      log.push(`control ${direction} ${setup.requestType} ${setup.request} ${length} ${data?.length ?? 0}`);
      const isRead = direction === "in";
      return Promise.resolve(
        isRead
          ? {
            status: "ok",
            data: Uint8Array.of(9, 8, 7)
          } as const
          : {
            status: "ok",
            bytesWritten: data?.length ?? 0
          } as const
      );
    },
    transfer({ direction, endpointNumber, length, data }: Parameters<UsbConnection["transfer"]>[0]) {
      log.push(`transfer ${direction} ${endpointNumber} ${length}`);
      const isRead = direction === "in";
      return Promise.resolve(
        isRead
          ? {
            status: "stall",
            data: Uint8Array.of(1, 2)
          } as const
          : {
            status: "ok",
            bytesWritten: data?.length ?? 0
          } as const
      );
    },
    clearHalt({ direction, endpointNumber }: {
      direction: string;
      endpointNumber: number;
    }) {
      log.push(`halt ${direction} ${endpointNumber}`);
      return Promise.resolve();
    },
    reset: () => Promise.reject(
      new UsbFailure({
        message: "no reset",
        isUnsupported: true
      })
    )
  } satisfies UsbConnection;
  const backend = {
    list: () => Promise.resolve([...present]),
    open(id) {
      log.push(`open ${id}`);

      const isLocked = id === "usb-c";
      if (isLocked) {
        return Promise.reject(new UsbFailure({ message: "access denied" }));
      }

      return Promise.resolve(connection);
    },
    subscribe(onChange) {
      notify = onChange;
      return () => {
        notify = undefined;
      };
    }
  } satisfies Backend;
  return {
    backend,
    log,
    present,
    change: () => notify?.(),
    get isWatching() {
      return notify !== undefined;
    }
  };
}

function pickFirst({ candidates }: { candidates: readonly UsbDeviceInfo[] }) {
  return Promise.resolve(candidates.slice(0, 1));
}

async function withUsb({ fake = fakeBackend(), chooser = pickFirst, run }: {
  fake?: ReturnType<typeof fakeBackend>;
  chooser?: DeviceChooser<UsbDeviceInfo>;
  run: (fake: ReturnType<typeof fakeBackend>) => Promise<void>;
}) {
  const uninstall = installUsb({
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

function nextTick() {
  return new Promise<void>(resolve => {
    setImmediate(resolve);
  });
}

test("requestDevice filters, asks the chooser and allows the pick; getDevices lists the allowed", async () => {
  const offered: string[][] = [];
  await withUsb({
    chooser({ candidates }) {
      offered.push(candidates.map(candidate => candidate.id));
      return Promise.resolve(candidates.slice(-1));
    },
    async run() {
      assert.ok(navigator.usb instanceof USB);
      assert.deepEqual(await navigator.usb.getDevices(), []);
      const device = await navigator.usb.requestDevice({ filters: [{ vendorId: 0x1234 }] });
      assert.ok(device instanceof USBDevice);
      assert.equal(device.productId, 2);
      assert.equal(device.usbVersionMajor, 2);
      assert.equal(device.usbVersionMinor, 1);
      assert.equal(device.deviceVersionMajor, 1);
      assert.equal(device.interfacePath, "usb-b");
      await navigator.usb.requestDevice({
        filters: [
          {
            vendorId: 0x1234,
            productId: 1
          },
          { serialNumber: "none" }
        ]
      });
      await navigator.usb.requestDevice({ filters: [] });
      assert.deepEqual(offered, [["usb-a", "usb-b"], ["usb-a"], ["usb-a", "usb-b", "usb-c"]]);
      const allowed = await navigator.usb.getDevices();
      assert.deepEqual(allowed.map(item => item.interfacePath).sort(), ["usb-a", "usb-b", "usb-c"]);
      assert.equal(allowed.find(item => item.interfacePath === "usb-b"), device);
    }
  });
});

test("requestDevice rejects invalid filters, no chooser, and a cancel", async () => {
  const fake = fakeBackend();
  const uninstall = installUsb({ backend: fake.backend });
  await assert.rejects(navigator.usb.requestDevice({ filters: [] }), isDomError("NotAllowedError"));
  await assert.rejects(navigator.usb.requestDevice({ filters: [{ productId: 1 }] }), TypeError);
  await assert.rejects(navigator.usb.requestDevice({ filters: [{ subclassCode: 1 }] }), TypeError);
  await assert.rejects(
    navigator.usb.requestDevice({
      filters: [{
        classCode: 1,
        protocolCode: 1
      }]
    }), TypeError
  );
  await assert.rejects(
    navigator.usb.requestDevice({
      filters: [],
      chooser: () => Promise.resolve([])
    }),
    isDomError("NotFoundError")
  );
  uninstall();
});

test("a device must be opened, configured and claimed before it transfers", async () => {
  await withUsb({
    async run(fake) {
      const device = await navigator.usb.requestDevice({ filters: [{ vendorId: 0x1234 }] });
      assert.equal(device.opened, false);
      assert.deepEqual(device.configurations, []);
      assert.equal(device.configuration === null, true);
      await assert.rejects(device.claimInterface(0), isDomError("InvalidStateError"));
      await assert.rejects(device.transferIn(1, 8), isDomError("InvalidStateError"));
      await device.open();
      await device.open();
      assert.equal(device.opened, true);
      assert.equal(device.configuration?.configurationValue, 1);
      assert.equal(device.configurations.length, 1);
      await assert.rejects(device.selectConfiguration(5), isDomError("NotFoundError"));
      await device.selectConfiguration(1);
      await assert.rejects(device.claimInterface(7), isDomError("NotFoundError"));
      await assert.rejects(device.transferIn(1, 8), isDomError("NotFoundError"));
      await assert.rejects(device.releaseInterface(0), isDomError("InvalidStateError"));
      await device.claimInterface(0);
      assert.equal(device.configuration?.interfaces[0]?.claimed, true);
      assert.equal(device.configuration?.interfaces[0]?.alternate?.alternateSetting, 0);
      assert.deepEqual(fake.log.filter(entry => entry.startsWith("open")), ["open usb-a"]);
    }
  });
});

test("transfers go to claimed endpoints and return DataViews", async () => {
  await withUsb({
    async run(fake) {
      const device = await navigator.usb.requestDevice({ filters: [] });
      await device.open();
      await device.selectConfiguration(1);
      await device.claimInterface(0);
      const read = await device.transferIn(1, 8);
      assert.ok(read instanceof USBInTransferResult);
      assert.equal(read.status, "stall");
      assert.deepEqual(bytesOfView(read.data), [1, 2]);
      const written = await device.transferOut(2, Uint8Array.of(1, 2, 3));
      assert.equal(written.bytesWritten, 3);
      await assert.rejects(device.transferOut(1, Uint8Array.of(1)), isDomError("NotFoundError"));
      await assert.rejects(device.transferIn(3, 8), isDomError("NotSupportedError"));
      await assert.rejects(device.transferIn(16, 8), RangeError);
      await device.clearHalt("in", 1);
      const control = await device.controlTransferIn({
        requestType: "vendor",
        recipient: "device",
        request: 6,
        value: 0x100,
        index: 0
      }, 3);
      assert.deepEqual(bytesOfView(control.data), [9, 8, 7]);
      const out = await device.controlTransferOut({
        requestType: "class",
        recipient: "interface",
        request: 9,
        value: 1,
        index: 0
      }, Uint8Array.of(5, 5));
      assert.equal(out.bytesWritten, 2);
      await assert.rejects(
        device.controlTransferOut({
          requestType: "class",
          recipient: "interface",
          request: 9,
          value: 1,
          index: 4
        }), isDomError("InvalidStateError")
      );
      const wire = fake.log.filter(entry => /^(transfer|control|halt)/u.test(entry));
      assert.deepEqual(wire, [
        "transfer in 1 8",
        "transfer out 2 3",
        "halt in 1",
        "control in vendor 6 3 0",
        "control out class 9 2 2"
      ]);
    }
  });
});

test("alternate settings, release, close, and the calls Windows cannot make", async () => {
  await withUsb({
    async run(fake) {
      const device = await navigator.usb.requestDevice({ filters: [] });
      await device.open();
      await device.selectConfiguration(1);
      await device.claimInterface(0);
      await assert.rejects(device.selectAlternateInterface(0, 9), isDomError("NotFoundError"));
      await device.selectAlternateInterface(0, 1);
      assert.equal(device.configuration?.interfaces[0]?.alternate?.alternateSetting, 1);
      await assert.rejects(device.transferIn(1, 8), isDomError("NotFoundError"));
      await assert.rejects(device.reset(), isDomError("NotSupportedError"));
      await assert.rejects(device.isochronousTransferIn(), isDomError("NotSupportedError"));
      await device.releaseInterface(0);
      assert.equal(device.configuration?.interfaces[0]?.claimed, false);
      await device.close();
      assert.equal(device.opened, false);
      assert.equal(fake.log.includes("close"), true);
    }
  });
});

test("a device that cannot be opened is NetworkError", async () => {
  await withUsb({
    chooser: ({ candidates }) => Promise.resolve(candidates.slice(-1)),
    async run() {
      const device = await navigator.usb.requestDevice({ filters: [{ vendorId: 0x4321 }] });
      await assert.rejects(device.open(), isDomError("NetworkError"));
      assert.equal(device.opened, false);
    }
  });
});

test("connect and disconnect fire for allowed devices only, and watching starts with the first listener", async () => {
  await withUsb({
    async run(fake) {
      assert.equal(fake.isWatching, false);
      const seen: string[] = [];
      const device = await navigator.usb.requestDevice({ filters: [{ vendorId: 0x1234 }] });
      navigator.usb.addEventListener("disconnect", event => {
        assert.ok(event instanceof USBConnectionEvent);
        seen.push(`disconnect ${event.device.interfacePath}`);
      });
      navigator.usb.onconnect = event => {
        assert.ok(event instanceof USBConnectionEvent);
        seen.push(`connect ${event.device.interfacePath}`);
      };
      assert.equal(fake.isWatching, true);
      await nextTick();
      await device.open();
      fake.present.splice(0, 2);
      fake.change();
      await nextTick();
      fake.present.push(
        infoOf({
          id: "usb-a",
          vendorId: 0x1234,
          productId: 1
        }),
        infoOf({
          id: "usb-z",
          vendorId: 9,
          productId: 9
        })
      );
      fake.change();
      await nextTick();
      assert.deepEqual(seen, ["disconnect usb-a", "connect usb-a"]);
      assert.equal(device.opened, false);
    }
  });
});

test("uninstalling closes the open devices, stops watching, and removes navigator.usb", async () => {
  const fake = fakeBackend();
  const uninstall = installUsb({
    backend: fake.backend,
    chooser: pickFirst
  });
  navigator.usb.addEventListener("connect", () => undefined);
  const device = await navigator.usb.requestDevice({ filters: [] });
  await device.open();
  uninstall();
  await nextTick();
  assert.equal(device.opened, false);
  assert.equal(fake.isWatching, false);
  assert.equal("usb" in navigator, false);
});
