import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// navigator.storage over a per-test temporary folder: the origin private file
// system, the estimate, persistence, the permission and the location extra.

const { installStorage } = await import("./storage.ts");
const { installPermissions } = await import("./permissions.ts");

async function withStorage(run: (root: string) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), "wa-c-storage-test-"));
  const uninstallPermissions = installPermissions();
  const uninstall = installStorage({
    appName: "demo",
    environment: {
      localAppData: path.join(root, "local"),
      roamingAppData: path.join(root, "roaming"),
      temporary: path.join(root, "temporary")
    }
  });
  try {
    await run(root);
  } finally {
    uninstall();
    uninstallPermissions();
    rmSync(root, {
      recursive: true,
      force: true
    });
  }
}

test("getDirectory is a folder of the app that holds real files", () => withStorage(async root => {
  const directory = await navigator.storage.getDirectory();
  const handle = await directory.getFileHandle("note.txt", { create: true });
  const stream = await handle.createWritable();
  await stream.write("kept");
  await stream.close();
  const file = path.join(root, "local", "demo", "origin-private-file-system", "note.txt");
  assert.equal(readFileSync(file, "utf8"), "kept");
  assert.equal(directory.kind, "directory");
}));

test("estimate counts the bytes used and adds the free space to the quota", () => withStorage(async () => {
  const directory = await navigator.storage.getDirectory();
  const stream = await (await directory.getFileHandle("a.bin", { create: true })).createWritable();
  await stream.write(new Uint8Array(1000));
  await stream.close();
  const { usage, quota } = await navigator.storage.estimate();
  assert.equal(usage, 1000);
  assert.ok((quota ?? 0) > (usage ?? 0));
}));

test("persist and persisted are true, and the permission is granted", () => withStorage(async () => {
  assert.equal(await navigator.storage.persist(), true);
  assert.equal(await navigator.storage.persisted(), true);
  const status = await navigator.permissions.query({ name: "persistent-storage" });
  assert.equal(status.state, "granted");
}));

test("the location extra picks the roaming or the temporary folder", () => withStorage(async root => {
  const roaming = await navigator.storage.getDirectory({ location: "roaming" });
  const temporary = await navigator.storage.getDirectory({ location: "temporary" });
  assert.equal(roaming.path, path.join(root, "roaming", "demo", "origin-private-file-system"));
  assert.equal(existsSync(temporary.path), true);
}));

test("uninstall takes navigator.storage away", async () => {
  await withStorage(() => Promise.resolve());
  assert.equal("storage" in navigator, false);
});
