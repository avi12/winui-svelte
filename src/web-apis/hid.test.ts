import type { DeviceChooser } from "./device-grants.ts";
import type { HidConnection, HidDeviceInfo, HidReport } from "./hid-backend.ts";
// WebHID over a stand-in for the Windows backend: filters and exclusions, the
// chooser seam, open and close, input reports as events, output and feature
// reports, and connect and disconnect. No hardware.
import assert from "node:assert/strict";
import { test } from "node:test";

const { HID, HIDConnectionEvent, HIDDevice, HIDInputReportEvent, installHid } = await import("./hid.ts");
const { HidFailure } = await import("./hid-backend.ts");

type Backend = NonNullable<NonNullable<Parameters<typeof installHid>[0]>["backend"]>;

function infoOf({ id, vendorId, productId, usagePage, usage }: {
  id: string;
  vendorId: number;
  productId: number;
  usagePage: number;
  usage: number;
}) {
  return {
    id,
    vendorId,
    productId,
    usagePage,
    usage,
    productName: `Pad ${productId}`
  } satisfies HidDeviceInfo;
}

function bytesOfView(view: DataView) {
  return [...new Uint8Array(view.buffer, view.byteOffset, view.byteLength)];
}

function fakeBackend() {
  const present = [
    infoOf({
      id: "hid-a",
      vendorId: 1,
      productId: 10,
      usagePage: 1,
      usage: 6
    }),
    infoOf({
      id: "hid-b",
      vendorId: 1,
      productId: 11,
      usagePage: 1,
      usage: 2
    }),
    infoOf({
      id: "hid-c",
      vendorId: 2,
      productId: 12,
      usagePage: 0xFF00,
      usage: 1
    })
  ];
  const log: string[] = [];
  let notify: (() => void) | undefined;
  let report: ((value: HidReport) => void) | undefined;
  const connection = {
    onInputReport(callback) {
      report = callback;
      return () => {
        report = undefined;
      };
    },
    sendReport({ reportId, data }: HidReport) {
      log.push(`output ${reportId} ${[...data]}`);
      return Promise.resolve();
    },
    sendFeatureReport({ reportId, data }: HidReport) {
      log.push(`feature ${reportId} ${[...data]}`);
      return Promise.resolve();
    },
    receiveFeatureReport: (reportId: number) => Promise.resolve(Uint8Array.of(reportId, 7)),
    close: () => log.push("close")
  } satisfies HidConnection;
  const backend = {
    list: () => Promise.resolve([...present]),
    open(id) {
      log.push(`open ${id}`);
      const isBlocked = id === "hid-c";
      if (isBlocked) {
        return Promise.reject(new HidFailure("access denied"));
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
    send: (value: HidReport) => report?.(value),
    get isWatching() {
      return notify !== undefined;
    }
  };
}

function pickAll({ candidates }: { candidates: readonly HidDeviceInfo[] }) {
  return Promise.resolve(candidates);
}

async function withHid({ fake = fakeBackend(), chooser = pickAll, run }: {
  fake?: ReturnType<typeof fakeBackend>;
  chooser?: DeviceChooser<HidDeviceInfo>;
  run: (fake: ReturnType<typeof fakeBackend>) => Promise<void>;
}) {
  const uninstall = installHid({
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

test("requestDevice filters by vendor, usage page and usage, honours exclusions, and returns every pick", async () => {
  const offered: string[][] = [];
  await withHid({
    chooser({ candidates }) {
      offered.push(candidates.map(candidate => candidate.id));
      return Promise.resolve(candidates);
    },
    async run() {
      assert.ok(navigator.hid instanceof HID);
      const keyboards = await navigator.hid.requestDevice({
        filters: [{
          usagePage: 1,
          usage: 6
        }]
      });
      assert.equal(keyboards.length, 1);
      assert.ok(keyboards[0] instanceof HIDDevice);
      assert.equal(keyboards[0].productName, "Pad 10");
      assert.equal(keyboards[0].collections[0]?.usagePage, 1);
      await navigator.hid.requestDevice({ filters: [{ vendorId: 1 }] });
      await navigator.hid.requestDevice({
        filters: [{ vendorId: 1 }],
        exclusionFilters: [{
          usagePage: 1,
          usage: 2
        }]
      });
      await navigator.hid.requestDevice({ filters: [] });
      assert.deepEqual(offered, [["hid-a"], ["hid-a", "hid-b"], ["hid-a"], ["hid-a", "hid-b", "hid-c"]]);
      assert.equal((await navigator.hid.getDevices()).length, 3);
    }
  });
});

test("requestDevice rejects a usage without a page, no chooser, and a cancel", async () => {
  const uninstall = installHid({ backend: fakeBackend().backend });
  await assert.rejects(navigator.hid.requestDevice({ filters: [] }), isDomError("NotAllowedError"));
  await assert.rejects(navigator.hid.requestDevice({ filters: [{ usage: 6 }] }), TypeError);
  await assert.rejects(
    navigator.hid.requestDevice({
      filters: [],
      chooser: () => Promise.resolve([])
    }),
    isDomError("NotFoundError")
  );
  uninstall();
});

test("an open device raises inputreport, and the reports it sends and asks for go through", async () => {
  await withHid({
    async run(fake) {
      const [device] = await navigator.hid.requestDevice({ filters: [{ vendorId: 1 }] });
      assert.ok(device);
      await assert.rejects(device.sendReport(1, Uint8Array.of(1)), isDomError("InvalidStateError"));
      assert.equal(device.opened, false);
      await device.open();
      await device.open();
      assert.equal(device.opened, true);
      const seen: Array<{
        id: number;
        bytes: number[];
      }> = [];
      device.oninputreport = event => {
        assert.ok(event instanceof HIDInputReportEvent);
        seen.push({
          id: event.reportId,
          bytes: bytesOfView(event.data)
        });
      };
      fake.send({
        reportId: 3,
        data: Uint8Array.of(4, 5)
      });
      assert.deepEqual(seen, [{
        id: 3,
        bytes: [4, 5]
      }]);
      await device.sendReport(2, Uint8Array.of(9));
      await device.sendFeatureReport(0, Uint8Array.of(8, 8));
      assert.deepEqual(bytesOfView(await device.receiveFeatureReport(5)), [5, 7]);
      assert.deepEqual(fake.log.filter(entry => /^(output|feature)/u.test(entry)), ["output 2 9", "feature 0 8,8"]);
      await device.close();
      fake.send({
        reportId: 1,
        data: Uint8Array.of(1)
      });
      assert.equal(seen.length, 1);
      assert.equal(device.opened, false);
    }
  });
});

test("a device that cannot be opened is NotAllowedError", async () => {
  await withHid({
    async run() {
      const [device] = await navigator.hid.requestDevice({ filters: [{ vendorId: 2 }] });
      assert.ok(device);
      await assert.rejects(device.open(), isDomError("NotAllowedError"));
      assert.equal(device.opened, false);
    }
  });
});

test("forget removes the permission", async () => {
  await withHid({
    async run() {
      const [device] = await navigator.hid.requestDevice({ filters: [{ vendorId: 2 }] });
      assert.ok(device);
      await device.forget();
      assert.deepEqual(await navigator.hid.getDevices(), []);
    }
  });
});

test("connect and disconnect fire for allowed devices only, and watching starts with the first listener", async () => {
  await withHid({
    async run(fake) {
      assert.equal(fake.isWatching, false);
      const seen: string[] = [];
      const [device] = await navigator.hid.requestDevice({ filters: [{ usagePage: 1 }] });
      assert.ok(device);
      navigator.hid.addEventListener("disconnect", event => {
        assert.ok(event instanceof HIDConnectionEvent);
        seen.push(`disconnect ${event.device.interfacePath}`);
      });
      navigator.hid.onconnect = event => {
        assert.ok(event instanceof HIDConnectionEvent);
        seen.push(`connect ${event.device.interfacePath}`);
      };
      assert.equal(fake.isWatching, true);
      await nextTick();
      await device.open();
      const gone = fake.present.splice(0, 1);
      fake.change();
      await nextTick();
      assert.equal(device.opened, false);
      fake.present.push(
        ...gone, infoOf({
          id: "hid-z",
          vendorId: 9,
          productId: 9,
          usagePage: 1,
          usage: 1
        })
      );
      fake.change();
      await nextTick();
      assert.deepEqual(seen, ["disconnect hid-a", "connect hid-a"]);
    }
  });
});

test("uninstalling closes the open devices, stops watching, and removes navigator.hid", async () => {
  const fake = fakeBackend();
  const uninstall = installHid({
    backend: fake.backend,
    chooser: pickAll
  });
  navigator.hid.addEventListener("connect", () => undefined);
  const [device] = await navigator.hid.requestDevice({ filters: [] });
  assert.ok(device);
  await device.open();
  uninstall();
  await nextTick();
  assert.equal(device.opened, false);
  assert.equal(fake.isWatching, false);
  assert.equal("hid" in navigator, false);
});
