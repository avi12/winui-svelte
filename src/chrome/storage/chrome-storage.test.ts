import type { StorageChanges } from "./storage-types.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// chrome.storage against an in-memory file: get in its three key shapes, set,
// remove, clear, bytes, quotas, events per area and combined, reload,
// corrupt files, session and managed.

const { ChromeStorage } = await import("./chrome-storage.ts");
const { AccessLevel, StorageAreaName } = await import("./storage-types.ts");

function memoryFile(initial?: string) {
  const state = { text: initial };
  return {
    state,
    read: () => state.text,
    write(text: string) {
      state.text = text;
    }
  };
}

function made() {
  const localFile = memoryFile();
  const syncFile = memoryFile();
  const storage = new ChromeStorage({
    localFile,
    syncFile
  });
  return {
    storage,
    localFile,
    syncFile
  };
}

test("get takes a key, keys, defaults or nothing", async () => {
  const { storage } = made();
  await storage.local.set({
    a: 1,
    b: {
      deep: [1, 2]
    },
    c: "x"
  });
  assert.deepEqual(await storage.local.get("a"), { a: 1 });
  assert.deepEqual(await storage.local.get(["a", "missing"]), { a: 1 });
  assert.deepEqual(
    await storage.local.get({
      a: 9,
      z: 5
    }), {
      a: 1,
      z: 5
    }
  );
  assert.deepEqual(await storage.local.get(null), {
    a: 1,
    b: {
      deep: [1, 2]
    },
    c: "x"
  });
  assert.deepEqual(await storage.local.get(), await storage.local.get(null));
  assert.deepEqual(await storage.local.getKeys(), ["a", "b", "c"]);
  await assert.rejects(storage.local.get(5 as never));
});

test("values are JSON: undefined is dropped and NaN becomes null", async () => {
  const { storage } = made();
  await storage.local.set({
    gone: undefined,
    nan: Number.NaN,
    date: new Date(0)
  });
  assert.deepEqual(await storage.local.get(null), {
    nan: null,
    date: "1970-01-01T00:00:00.000Z"
  });
});

test("remove and clear", async () => {
  const { storage } = made();
  await storage.local.set({
    a: 1,
    b: 2,
    c: 3
  });
  await storage.local.remove("a");
  await storage.local.remove(["b", "nope"]);
  assert.deepEqual(await storage.local.get(null), { c: 3 });
  await storage.local.clear();
  assert.deepEqual(await storage.local.get(null), {});
});

test("getBytesInUse counts the key and the JSON text", async () => {
  const { storage } = made();
  await storage.local.set({
    ab: "xyz",
    c: 1
  });
  assert.equal(await storage.local.getBytesInUse("ab"), 2 + 5);
  assert.equal(await storage.local.getBytesInUse(["ab", "c", "none"]), 7 + 2);
  assert.equal(await storage.local.getBytesInUse(), 9);
  assert.equal(await storage.local.getBytesInUse(null), 9);
});

test("the file is written after each change and read back by a new instance", async () => {
  const { storage, localFile } = made();
  await storage.local.set({
    a: {
      b: 1
    }
  });
  assert.deepEqual(JSON.parse(localFile.state.text ?? ""), {
    a: {
      b: 1
    }
  });
  const again = new ChromeStorage({
    localFile,
    syncFile: memoryFile()
  });
  assert.deepEqual(await again.local.get("a"), {
    a: {
      b: 1
    }
  });
});

test("a corrupt or wrongly shaped file reads as empty", async () => {
  for (const text of ["{not json", "[1,2]", "null"]) {
    const storage = new ChromeStorage({
      localFile: memoryFile(text),
      syncFile: memoryFile()
    });
    assert.deepEqual(await storage.local.get(null), {});
  }
});

test("a rejected write stores nothing and writes no file", async () => {
  const { storage, syncFile } = made();
  await storage.sync.set({ keep: 1 });
  const before = syncFile.state.text;
  await assert.rejects(
    storage.sync.set({
      keep: 2,
      big: "x".repeat(storage.sync.QUOTA_BYTES_PER_ITEM ?? 0)
    }), /QUOTA_BYTES_PER_ITEM/
  );
  assert.deepEqual(await storage.sync.get(null), { keep: 1 });
  assert.equal(syncFile.state.text, before);
});

test("sync enforces total bytes and item count", async () => {
  const { storage } = made();
  const perItem = (storage.sync.QUOTA_BYTES_PER_ITEM ?? 0) - 20;
  for (let i = 0; i < 12; i += 1) {
    await storage.sync.set({ [`k${i}`]: "x".repeat(perItem) });
  }

  await assert.rejects(storage.sync.set({ k12: "x".repeat(perItem) }), /QUOTA_BYTES quota/);
  await storage.sync.clear();
  const many: Record<string, number> = {};
  for (let i = 0; i < (storage.sync.MAX_ITEMS ?? 0) + 1; i += 1) {
    many[`i${i}`] = 1;
  }

  await assert.rejects(storage.sync.set(many), /MAX_ITEMS/);
  assert.equal(storage.sync.MAX_WRITE_OPERATIONS_PER_MINUTE, 120);
});

test("local and session publish the 10 MiB quota and enforce it", async () => {
  const { storage } = made();
  assert.equal(storage.local.QUOTA_BYTES, 10_485_760);
  assert.equal(storage.session.QUOTA_BYTES, 10_485_760);
  assert.equal(storage.local.QUOTA_BYTES_PER_ITEM, undefined);
  await assert.rejects(storage.session.set({ big: "x".repeat(10_485_760) }), /QUOTA_BYTES quota/);
});

test("onChanged fires per area with old and new values, and combined with the area name", async () => {
  const { storage } = made();
  const areaEvents: StorageChanges[] = [];
  const combined: Array<[StorageChanges, string]> = [];
  storage.local.onChanged.addListener(changes => areaEvents.push(changes));
  storage.onChanged.addListener((changes, areaName) => combined.push([changes, areaName]));
  await storage.local.set({ a: 1 });
  await storage.local.set({ a: 1 });
  await storage.local.set({ a: 2 });
  await storage.local.remove("a");
  await storage.local.remove("a");
  await storage.sync.set({ s: true });
  assert.deepEqual(areaEvents, [
    {
      a: {
        newValue: 1
      }
    },
    {
      a: {
        oldValue: 1,
        newValue: 2
      }
    },
    {
      a: {
        oldValue: 2
      }
    }
  ]);
  const names = combined.map(([, name]) => name);
  assert.deepEqual(names, [
    StorageAreaName.LOCAL,
    StorageAreaName.LOCAL,
    StorageAreaName.LOCAL,
    StorageAreaName.SYNC
  ]);
  assert.deepEqual(combined[3]?.[0], {
    s: {
      newValue: true
    }
  });
});

test("clear reports every removed key", async () => {
  const { storage } = made();
  await storage.local.set({
    a: 1,
    b: 2
  });
  const seen: StorageChanges[] = [];
  storage.local.onChanged.addListener(changes => seen.push(changes));
  await storage.local.clear();
  await storage.local.clear();
  assert.deepEqual(seen, [
    {
      a: {
        oldValue: 1
      },
      b: {
        oldValue: 2
      }
    }
  ]);
});

test("session lives in memory only and is separate per instance", async () => {
  const { storage, localFile } = made();
  await storage.session.set({ token: "t" });
  assert.deepEqual(await storage.session.get("token"), { token: "t" });
  assert.equal(localFile.state.text, undefined);
  const other = new ChromeStorage({
    localFile: memoryFile(),
    syncFile: memoryFile()
  });
  assert.deepEqual(await other.session.get(null), {});
});

test("managed is empty and read-only", async () => {
  const { storage } = made();
  assert.deepEqual(await storage.managed.get(null), {});
  assert.deepEqual(await storage.managed.get({ policy: "default" }), { policy: "default" });
  await assert.rejects(storage.managed.set({ a: 1 }), /read-only/);
  await assert.rejects(storage.managed.remove("a"), /read-only/);
  await assert.rejects(storage.managed.clear(), /read-only/);
});

test("setAccessLevel keeps the level and rejects an unknown one", async () => {
  const { storage } = made();
  assert.equal(storage.session.accessLevel, AccessLevel.TRUSTED_CONTEXTS);
  await storage.session.setAccessLevel({ accessLevel: AccessLevel.TRUSTED_AND_UNTRUSTED_CONTEXTS });
  assert.equal(storage.session.accessLevel, AccessLevel.TRUSTED_AND_UNTRUSTED_CONTEXTS);
  await assert.rejects(storage.session.setAccessLevel({ accessLevel: "NOPE" as never }));
});
