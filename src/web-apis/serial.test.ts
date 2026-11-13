import type { DeviceChooser } from "./device-grants.ts";
import type { SerialConnection, SerialLineError, SerialPortInfo, SerialSettings } from "./serial-backend.ts";
// Web Serial over a stand-in for the Windows backend: filters, the chooser
// seam, open validation, the readable and writable streams, closing with
// locked streams, line errors, the control signals, and connect and
// disconnect. No hardware.
import assert from "node:assert/strict";
import { test } from "node:test";

const { installSerial, Serial, SerialConnectionEvent, SerialPort } = await import("./serial.ts");
const { SerialFailure } = await import("./serial-backend.ts");

type Backend = NonNullable<NonNullable<Parameters<typeof installSerial>[0]>["backend"]>;

function nextTick() {
  return new Promise<void>(resolve => {
    setImmediate(resolve);
  });
}

function fakeBackend() {
  const present = [
    {
      id: "port-a",
      portName: "COM3",
      usbVendorId: 0x2341,
      usbProductId: 0x43
    },
    {
      id: "port-b",
      portName: "COM4",
      usbVendorId: 0x2341,
      usbProductId: 0x44
    },
    {
      id: "port-c",
      portName: "COM9"
    }
  ] satisfies SerialPortInfo[];
  const log: string[] = [];
  const settingsSeen: SerialSettings[] = [];
  const incoming: (Uint8Array | null)[] = [];
  const waiting: (() => void)[] = [];
  const errorCallbacks = new Set<(error: SerialLineError) => void>();
  let notify: (() => void) | undefined;
  const connection = {
    async read() {
      while (incoming.length === 0) {
        await new Promise<void>(resolve => {
          waiting.push(resolve);
        });
      }

      return incoming.shift() ?? null;
    },
    write(data: Uint8Array) {
      log.push(`write ${[...data]}`);
      return Promise.resolve();
    },
    setSignals(signals: object) {
      log.push(`signals ${JSON.stringify(signals)}`);
    },
    getSignals: () => ({
      dataCarrierDetect: true,
      clearToSend: false,
      ringIndicator: false,
      dataSetReady: true
    }),
    onError(callback) {
      errorCallbacks.add(callback);
      return () => errorCallbacks.delete(callback);
    },
    close() {
      log.push("close");
      incoming.push(null);
      for (const wake of waiting.splice(0)) {
        wake();
      }
    }
  } satisfies SerialConnection;
  const backend = {
    list: () => Promise.resolve([...present]),
    open({ id, settings }) {
      log.push(`open ${id}`);
      settingsSeen.push(settings);
      const isBusy = id === "port-c";
      if (isBusy) {
        return Promise.reject(new SerialFailure("port is busy"));
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
    settingsSeen,
    change: () => notify?.(),
    receive(bytes: Uint8Array) {
      incoming.push(bytes);
      for (const wake of waiting.splice(0)) {
        wake();
      }
    },
    raise(error: SerialLineError) {
      for (const callback of Array.from(errorCallbacks)) {
        callback(error);
      }
    },
    get isWatching() {
      return notify !== undefined;
    }
  };
}

function pickFirst({ candidates }: { candidates: readonly SerialPortInfo[] }) {
  return Promise.resolve(candidates.slice(0, 1));
}

async function withSerial({ fake = fakeBackend(), chooser = pickFirst, run }: {
  fake?: ReturnType<typeof fakeBackend>;
  chooser?: DeviceChooser<SerialPortInfo>;
  run: (fake: ReturnType<typeof fakeBackend>) => Promise<void>;
}) {
  const uninstall = installSerial({
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

test("requestPort filters by USB ids, asks the chooser and allows the pick; getPorts lists the allowed", async () => {
  const offered: string[][] = [];
  await withSerial({
    chooser({ candidates }) {
      offered.push(candidates.map(candidate => candidate.id));
      return Promise.resolve(candidates.slice(-1));
    },
    async run() {
      assert.ok(navigator.serial instanceof Serial);
      assert.deepEqual(await navigator.serial.getPorts(), []);
      const port = await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x2341 }] });
      assert.ok(port instanceof SerialPort);
      assert.equal(port.portName, "COM4");
      assert.deepEqual(port.getInfo(), {
        usbVendorId: 0x2341,
        usbProductId: 0x44
      });
      await navigator.serial.requestPort({
        filters: [{
          usbVendorId: 0x2341,
          usbProductId: 0x43
        }]
      });
      const bare = await navigator.serial.requestPort();
      assert.deepEqual(bare.getInfo(), {});
      assert.deepEqual(offered, [["port-a", "port-b"], ["port-a"], ["port-a", "port-b", "port-c"]]);
      assert.equal((await navigator.serial.getPorts()).length, 3);
    }
  });
});

test("requestPort rejects a product id alone, no chooser, and a cancel", async () => {
  const uninstall = installSerial({ backend: fakeBackend().backend });
  await assert.rejects(navigator.serial.requestPort(), isDomError("NotAllowedError"));
  await assert.rejects(navigator.serial.requestPort({ filters: [{ usbProductId: 1 }] }), TypeError);
  await assert.rejects(
    navigator.serial.requestPort({ chooser: () => Promise.resolve([]) }),
    isDomError("NotFoundError")
  );
  uninstall();
});

test("open checks its options, fills the defaults and refuses to open twice", async () => {
  await withSerial({
    async run(fake) {
      const port = await navigator.serial.requestPort();
      const loose: { open(options: object): Promise<void> } = port;
      await assert.rejects(loose.open({}), TypeError);
      await assert.rejects(
        port.open({
          baudRate: 9600,
          dataBits: 9
        }), TypeError
      );
      await assert.rejects(
        port.open({
          baudRate: 9600,
          bufferSize: 0
        }), TypeError
      );
      assert.equal(port.readable === null && port.writable === null, true);
      await port.open({ baudRate: 115_200 });
      assert.deepEqual(fake.settingsSeen, [{
        baudRate: 115_200,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        bufferSize: 255,
        flowControl: "none"
      }]);
      await assert.rejects(port.open({ baudRate: 9600 }), isDomError("InvalidStateError"));
      assert.ok(port.readable instanceof ReadableStream);
      assert.ok(port.writable instanceof WritableStream);
    }
  });
});

test("a port that cannot be opened is NetworkError", async () => {
  await withSerial({
    chooser: ({ candidates }) => Promise.resolve(candidates.slice(-1)),
    async run() {
      const port = await navigator.serial.requestPort();
      await assert.rejects(port.open({ baudRate: 9600 }), isDomError("NetworkError"));
      assert.equal(port.readable === null, true);
    }
  });
});

test("readable yields what arrives and writable sends what is written", async () => {
  await withSerial({
    async run(fake) {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      const { readable, writable } = port;
      assert.ok(readable && writable);
      const reader = readable.getReader();
      fake.receive(Uint8Array.of(1, 2, 3));
      const first = await reader.read();
      assert.deepEqual([...first.value ?? []], [1, 2, 3]);
      const writer = writable.getWriter();
      await writer.write(Uint8Array.of(7, 8));
      await writer.write(Uint8Array.of(9).buffer);
      writer.releaseLock();
      assert.deepEqual(fake.log.filter(entry => entry.startsWith("write")), ["write 7,8", "write 9"]);
      reader.releaseLock();
      await port.close();
      assert.equal(fake.log.includes("close"), true);
      assert.equal(port.readable === null && port.writable === null, true);
    }
  });
});

test("close needs an open port and free streams", async () => {
  await withSerial({
    async run() {
      const port = await navigator.serial.requestPort();
      await assert.rejects(port.close(), isDomError("InvalidStateError"));
      await port.open({ baudRate: 9600 });
      const reader = port.readable?.getReader();
      assert.ok(reader);
      await assert.rejects(port.close(), TypeError);
      reader.releaseLock();
      await port.close();
    }
  });
});

test("a line error errors the readable and a fresh one takes its place", async () => {
  await withSerial({
    async run(fake) {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      const before = port.readable;
      assert.ok(before);
      const reader = before.getReader();
      fake.raise("FramingError");
      await assert.rejects(reader.read(), isDomError("FramingError"));
      assert.notEqual(port.readable, before);
      const next = port.readable?.getReader();
      fake.receive(Uint8Array.of(5));
      assert.deepEqual([...(await next?.read())?.value ?? []], [5]);
    }
  });
});

test("signals are set and read on an open port only", async () => {
  await withSerial({
    async run(fake) {
      const port = await navigator.serial.requestPort();
      await assert.rejects(port.setSignals({ dataTerminalReady: true }), isDomError("InvalidStateError"));
      await assert.rejects(port.getSignals(), isDomError("InvalidStateError"));
      await port.open({ baudRate: 9600 });
      await assert.rejects(port.setSignals({}), TypeError);
      await port.setSignals({
        dataTerminalReady: true,
        requestToSend: false
      });
      assert.deepEqual(fake.log.filter(entry => entry.startsWith("signals")), [
        "signals {\"dataTerminalReady\":true,\"requestToSend\":false}"
      ]);
      assert.deepEqual(await port.getSignals(), {
        dataCarrierDetect: true,
        clearToSend: false,
        ringIndicator: false,
        dataSetReady: true
      });
    }
  });
});

test("connect and disconnect fire on the port and on navigator.serial for allowed ports only", async () => {
  await withSerial({
    async run(fake) {
      assert.equal(fake.isWatching, false);
      const seen: string[] = [];
      const port = await navigator.serial.requestPort();
      port.addEventListener("disconnect", () => seen.push("port disconnect"));
      navigator.serial.addEventListener("disconnect", event => {
        assert.ok(event instanceof SerialConnectionEvent);
        seen.push(`serial disconnect ${event.port.portName}`);
      });
      navigator.serial.onconnect = event => {
        assert.ok(event instanceof SerialConnectionEvent);
        seen.push(`serial connect ${event.port.portName}`);
      };
      assert.equal(fake.isWatching, true);
      await nextTick();
      await port.open({ baudRate: 9600 });
      const gone = fake.present.splice(0, 1);
      fake.change();
      await nextTick();
      assert.equal(port.connected, false);
      assert.equal(port.readable === null, true);
      fake.present.push(...gone, {
        id: "port-z",
        portName: "COM99"
      });
      fake.change();
      await nextTick();
      assert.equal(port.connected, true);
      assert.deepEqual(seen, ["port disconnect", "serial disconnect COM3", "serial connect COM3"]);
    }
  });
});

test("uninstalling closes the open ports, stops watching, and removes navigator.serial", async () => {
  const fake = fakeBackend();
  const uninstall = installSerial({
    backend: fake.backend,
    chooser: pickFirst
  });
  navigator.serial.addEventListener("connect", () => undefined);
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 9600 });
  uninstall();
  assert.equal(fake.log.includes("close"), true);
  assert.equal(fake.isWatching, false);
  assert.equal("serial" in navigator, false);
});
