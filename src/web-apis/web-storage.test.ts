import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// localStorage and sessionStorage: the standard methods and property access,
// the quota, the debounced atomic write to a file, reload, corrupt files,
// events and uninstall. A manual scheduler stands in for the timers.

const { atomicFile, installWebStorage, StorageEvent } = await import("./web-storage.ts");

type Options = NonNullable<Parameters<typeof installWebStorage>[0]>;

function manualScheduler() {
  const pending = new Map<number, () => void>();
  const delays: number[] = [];
  let next = 0;
  return {
    pending,
    delays,
    schedule({ milliseconds, onTick }: {
      milliseconds: number;
      onTick: () => void;
    }) {
      next += 1;
      const id = next;
      pending.set(id, onTick);
      delays.push(milliseconds);
      return () => {
        pending.delete(id);
      };
    },
    tick() {
      const [first] = [...pending.values()];
      first?.();
    }
  };
}

async function withStorage({ options = {}, run }: {
  options?: Options;
  run: (context: {
    file: string;
    scheduler: ReturnType<typeof manualScheduler>;
  }) => void | Promise<void>;
}) {
  const folder = mkdtempSync(path.join(tmpdir(), "wa-c-web-storage-test-"));
  const file = path.join(folder, "nested", "local-storage.json");
  const scheduler = manualScheduler();
  const uninstall = installWebStorage({
    file: atomicFile(file),
    schedule: scheduler.schedule,
    ...options
  });
  try {
    await run({
      file,
      scheduler
    });
  } finally {
    uninstall();
    rmSync(folder, {
      recursive: true,
      force: true
    });
  }
}

test("the standard methods", () => withStorage({
  run() {
    localStorage.setItem("a", "1");
    localStorage.setItem("b", "2");
    assert.equal(localStorage.getItem("a"), "1");
    assert.equal(localStorage.getItem("missing"), null);
    assert.equal(localStorage.length, 2);
    assert.equal(localStorage.key(0), "a");
    assert.equal(localStorage.key(5), null);
    localStorage.removeItem("a");
    assert.equal(localStorage.length, 1);
    localStorage.clear();
    assert.equal(localStorage.length, 0);
  }
}));

test("properties work like items", () => withStorage({
  run() {
    localStorage["theme"] = "dark";
    assert.equal(localStorage.getItem("theme"), "dark");
    assert.equal(localStorage["theme"], "dark");
    assert.equal("theme" in localStorage, true);
    assert.deepEqual(Object.keys(localStorage), ["theme"]);

    delete localStorage["theme"];
    assert.equal(localStorage.length, 0);
    assert.equal(localStorage["theme"], undefined);
    assert.equal(typeof localStorage.getItem, "function");
  }
}));

test("sessionStorage is separate and never written", () => withStorage({
  run({ scheduler, file }) {
    sessionStorage.setItem("s", "1");
    assert.equal(localStorage.getItem("s"), null);
    assert.equal(scheduler.pending.size, 0);
    assert.equal(existsSync(file), false);
  }
}));

test("writes are debounced and land in one atomic file", () => withStorage({
  run({ file, scheduler }) {
    localStorage.setItem("a", "1");
    localStorage.setItem("b", "2");
    assert.equal(existsSync(file), false);
    assert.equal(scheduler.pending.size, 2);
    scheduler.tick();
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), {
      a: "1",
      b: "2"
    });
    assert.equal(existsSync(`${file}.swap`), false);
    assert.equal(scheduler.pending.size, 0);
    assert.deepEqual(scheduler.delays.slice(0, 2), [200, 2000]);
  }
}));

test("uninstall flushes the pending change and a new install reads it back", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "wa-c-web-storage-test-"));
  const file = path.join(folder, "local-storage.json");
  try {
    const scheduler = manualScheduler();
    const first = installWebStorage({
      file: atomicFile(file),
      schedule: scheduler.schedule
    });
    localStorage.setItem("kept", "yes");
    first();
    const second = installWebStorage({
      file: atomicFile(file),
      schedule: scheduler.schedule
    });
    assert.equal(localStorage.getItem("kept"), "yes");
    second();
  } finally {
    rmSync(folder, {
      recursive: true,
      force: true
    });
  }
});

test("a corrupt or wrongly shaped file starts empty", () => {
  for (const text of ["{not json", "[1,2]", "{\"a\":1}"]) {
    const folder = mkdtempSync(path.join(tmpdir(), "wa-c-web-storage-test-"));
    const file = path.join(folder, "local-storage.json");
    writeFileSync(file, text);
    const uninstall = installWebStorage({
      file: atomicFile(file),
      schedule: manualScheduler().schedule
    });
    assert.equal(localStorage.length, 0);
    uninstall();
    rmSync(folder, {
      recursive: true,
      force: true
    });
  }
});

test("passing the quota throws QuotaExceededError and keeps the old value", () => withStorage({
  options: {
    quotaCharacters: 9
  },
  run() {
    localStorage.setItem("k", "12345");
    assert.throws(() => localStorage.setItem("k", "123456789"), { name: "QuotaExceededError" });
    assert.equal(localStorage.getItem("k"), "12345");
    localStorage.setItem("k", "1234567");
    assert.equal(localStorage.getItem("k"), "1234567");
  }
}));

test("events fire only when asked, with the key and both values", () => {
  const target = new EventTarget();
  const seen: Array<[string | null, string | null, string | null]> = [];
  target.addEventListener("storage", event => {
    const isStorageEvent = event instanceof StorageEvent;
    if (isStorageEvent) {
      seen.push([event.key, event.oldValue, event.newValue]);
    }
  });
  const quiet = installWebStorage({
    eventTarget: target,
    file: {
      read: () => undefined,
      write: () => undefined
    },
    schedule: manualScheduler().schedule
  });
  localStorage.setItem("k", "0");
  quiet();
  const uninstall = installWebStorage({
    shouldNotifySelf: true,
    eventTarget: target,
    file: {
      read: () => undefined,
      write: () => undefined
    },
    schedule: manualScheduler().schedule
  });
  localStorage.setItem("k", "1");
  localStorage.setItem("k", "2");
  localStorage.removeItem("k");
  uninstall();
  assert.deepEqual(seen, [["k", null, "1"], ["k", "1", "2"], ["k", "2", null]]);
});

test("uninstall removes the globals", async () => {
  await withStorage({ run: () => undefined });
  assert.equal("localStorage" in globalThis && Object.getOwnPropertyDescriptor(globalThis, "localStorage")?.value instanceof Object, false);
  assert.equal("sessionStorage" in globalThis && Object.getOwnPropertyDescriptor(globalThis, "sessionStorage")?.value instanceof Object, false);
});
