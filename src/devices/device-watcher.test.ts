import { DeviceWatcherStatus } from "./bindings.ts";
import { FakeInformation, FakeWatcher, SIGNAL_NAME } from "./test-support/fake-watcher.ts";
import "#src/state/test-support/svelte-runes.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The watcher rune on a stand-in for WinRT's DeviceWatcher: devices arrive,
// change and leave through the keyed collection, the status follows the
// events, and the watcher ends with its scope, its signal and stop().

const { flushSync } = await import("svelte");
const { deviceWatcher } = await import("./device-watcher.svelte.ts");
const { track } = await import("#src/state/test-support/track.svelte.js");

function watchOver({ watcher, signal }: {
  watcher: FakeWatcher;
  signal?: AbortSignal;
}) {
  type Watch = ReturnType<typeof deviceWatcher>;
  let created: Watch | undefined;
  // The watcher is made in an effect that reads nothing, so it lives until the
  // test ends that effect; the reads are in an effect of their own.
  const scope = track(() => {
    created = deviceWatcher({
      requestedProperties: [SIGNAL_NAME],
      createSource: () => watcher,
      deliver(work) {
        work();
        flushSync();
      },
      ...signal === undefined ? {} : { signal }
    });
  });
  const watch = created;
  assert.ok(watch);
  const seen = track(() => ({
    names: watch.devices.items.map(device => device.name),
    status: watch.status,
    isCompleted: watch.isEnumerationCompleted
  }));
  return {
    watch,
    seen,
    scope
  };
}

test("devices arrive, change and leave through the keyed collection, which an effect sees", () => {
  const watcher = new FakeWatcher();
  const { watch, seen, scope } = watchOver({ watcher });
  assert.equal(watcher.startCount, 1, "the watcher starts at once");
  assert.deepEqual(watch.devices.items, []);

  watcher.add(
    new FakeInformation({
      id: "a",
      name: "Keyboard",
      signal: 1
    })
  );
  watcher.add(
    new FakeInformation({
      id: "b",
      name: "Mouse",
      signal: 2
    })
  );
  assert.deepEqual(watch.devices.keys, ["a", "b"]);
  assert.equal(watch.devices.get("b")?.name, "Mouse");
  assert.equal(watch.devices.get("a")?.properties.get(SIGNAL_NAME), 1);

  const before = watch.devices.get("a");
  watcher.update({
    id: "a",
    signal: 9
  });
  assert.notEqual(watch.devices.get("a"), before, "a change makes a new snapshot");
  assert.equal(watch.devices.get("a")?.properties.get(SIGNAL_NAME), 9);

  watcher.remove("b");
  assert.deepEqual(watch.devices.keys, ["a"]);
  assert.deepEqual(seen.values.at(-1)?.names, ["Keyboard"]);
  seen.stop();
  scope.stop();
});

test("the status follows the watcher and enumeration completes once", () => {
  const watcher = new FakeWatcher();
  const { watch, seen, scope } = watchOver({ watcher });
  assert.equal(watch.status, DeviceWatcherStatus.Started);
  assert.equal(watch.isEnumerationCompleted, false);
  watcher.completeEnumeration();
  assert.equal(watch.status, DeviceWatcherStatus.EnumerationCompleted);
  assert.equal(watch.isEnumerationCompleted, true);
  assert.equal(seen.values.at(-1)?.isCompleted, true);
  seen.stop();
  scope.stop();
});

test("a watcher the system aborts reports an error and keeps the devices found", () => {
  const watcher = new FakeWatcher();
  const { watch, seen, scope } = watchOver({ watcher });
  watcher.add(
    new FakeInformation({
      id: "a",
      name: "Printer",
      signal: 1
    })
  );
  watcher.abort();
  assert.equal(watch.status, DeviceWatcherStatus.Aborted);
  assert.equal(watch.error?.name, "DeviceWatcherAbortedError");
  assert.deepEqual(watch.devices.keys, ["a"]);
  seen.stop();
  scope.stop();
});

test("a watcher that cannot start is aborted with the reason", () => {
  const watcher = new FakeWatcher();
  watcher.startError = new Error("access denied");
  const { watch, seen, scope } = watchOver({ watcher });
  assert.equal(watch.status, DeviceWatcherStatus.Aborted);
  assert.equal(watch.error?.message, "access denied");
  seen.stop();
  scope.stop();
});

test("the scope ending stops the watcher and lets go of its events", () => {
  const watcher = new FakeWatcher();
  const { watch, seen, scope } = watchOver({ watcher });
  assert.ok(watcher.handlerCount > 0);
  seen.stop();
  scope.stop();
  flushSync();
  assert.equal(watcher.stopCount, 1);
  assert.equal(watcher.handlerCount, 0);
  assert.equal(watch.status, DeviceWatcherStatus.Stopped);
  watch.stop();
  assert.equal(watcher.stopCount, 1, "stopping twice stops once");
});

test("an aborted signal stops the watcher", () => {
  const watcher = new FakeWatcher();
  const controller = new AbortController();
  const { watch, seen, scope } = watchOver({
    watcher,
    signal: controller.signal
  });
  controller.abort();
  assert.equal(watcher.stopCount, 1);
  assert.equal(watch.status, DeviceWatcherStatus.Stopped);
  seen.stop();
  scope.stop();
});
