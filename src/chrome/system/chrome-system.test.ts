import type { SystemBackend } from "./system-backend.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// chrome.system over a fake machine: nothing is read from the real one.

const { createChromeSystem } = await import("./create-chrome-system.ts");

const AREA_SECONDARY = {
  id: 2n,
  isPrimary: false,
  outerBounds: {
    x: 1920,
    y: 0,
    width: 1280,
    height: 1024
  },
  workArea: {
    x: 1920,
    y: 0,
    width: 1280,
    height: 984
  }
};
const AREA_PRIMARY = {
  id: 1n,
  isPrimary: true,
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

function fakeBackend() {
  const state = {
    subscribed: 0,
    unsubscribed: 0
  };
  const fired = { notify() {} };
  const backend: SystemBackend = {
    cpus: () => [
      {
        model: "Fake CPU",
        times: {
          user: 10,
          nice: 0,
          sys: 5,
          idle: 85,
          irq: 0
        }
      },
      {
        model: "Fake CPU",
        times: {
          user: 20,
          nice: 0,
          sys: 10,
          idle: 70,
          irq: 0
        }
      }
    ],
    architecture: () => "x64",
    totalMemory: () => 16_000,
    freeMemory: () => 4000,
    drives: async () => [{
      root: "C:\\",
      label: "C:",
      type: "fixed",
      capacity: 500
    }],
    displays: {
      list: () => [AREA_SECONDARY, AREA_PRIMARY],
      subscriptions: [
        notify => {
          state.subscribed += 1;
          fired.notify = notify;
          return () => {
            state.unsubscribed += 1;
          };
        }
      ]
    },
    scale: () => 1.5
  };
  return {
    backend,
    state,
    fire: () => fired.notify()
  };
}

test("cpu.getInfo maps os.cpus", async () => {
  const { cpu } = createChromeSystem({ backend: fakeBackend().backend });
  const info = await cpu.getInfo();
  assert.equal(info.numOfProcessors, 2);
  assert.equal(info.archName, "x86-64");
  assert.equal(info.modelName, "Fake CPU");
  assert.deepEqual(info.features, ["mmx", "sse", "sse2"]);
  assert.deepEqual(info.processors[0]?.usage, {
    kernel: 5,
    user: 10,
    idle: 85,
    total: 100
  });
});

test("memory.getInfo reports capacity and free bytes", async () => {
  const { memory } = createChromeSystem({ backend: fakeBackend().backend });
  assert.deepEqual(await memory.getInfo(), {
    capacity: 16_000,
    availableCapacity: 4000
  });
});

test("storage.getInfo lists the drives", async () => {
  const { storage } = createChromeSystem({ backend: fakeBackend().backend });
  assert.deepEqual(await storage.getInfo(), [{
    id: "C:\\",
    name: "C:",
    type: "fixed",
    capacity: 500
  }]);
});

test("display.getInfo puts the primary first, with Chrome's bounds and the system dpi", async () => {
  const { display } = createChromeSystem({ backend: fakeBackend().backend });
  const [first, second] = await display.getInfo({ singleUnified: false });
  assert.equal(first?.id, "1");
  assert.equal(first?.name, "Display 1");
  assert.equal(first?.isPrimary, true);
  assert.equal(first?.dpiX, 144);
  assert.deepEqual(first?.workArea, {
    left: 0,
    top: 0,
    width: 1920,
    height: 1040
  });
  assert.equal(second?.id, "2");
  assert.deepEqual(second?.bounds, {
    left: 1920,
    top: 0,
    width: 1280,
    height: 1024
  });
});

test("display.getInfo rejects a flag of the wrong type", async () => {
  const { display } = createChromeSystem({ backend: fakeBackend().backend });
  // @ts-expect-error -- a caller from plain JavaScript can pass a string, which the schema must refuse
  await assert.rejects(display.getInfo({ singleUnified: "yes" }));
});

test("onDisplayChanged listens to the source only while a listener exists", () => {
  const fake = fakeBackend();
  const { display } = createChromeSystem({ backend: fake.backend });
  const calls: string[] = [];
  function listener() {
    calls.push("changed");
  }
  assert.equal(fake.state.subscribed, 0);
  display.onDisplayChanged.addListener(listener);
  assert.equal(fake.state.subscribed, 1);
  fake.fire();
  assert.deepEqual(calls, ["changed"]);
  display.onDisplayChanged.removeListener(listener);
  assert.equal(fake.state.unsubscribed, 1);
});
