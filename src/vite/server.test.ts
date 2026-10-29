import { startModuleServer } from "./server.ts";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { MessageChannel } from "node:worker_threads";

// The dev server watches the window's sources, not the folders beside them
// that hold thousands of files of other things.

const WATCH_SETTLE_MILLISECONDS = 500;

test("the watcher skips build output, worktrees and the restored SDK", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "winui-server-"));
  for (const folder of ["src", "dist", ".worktrees", ".winapp"]) {
    mkdirSync(path.join(root, folder));
    writeFileSync(path.join(root, folder, "file.ts"), "export const a = 1;\n");
  }

  const channel = new MessageChannel();
  const server = await startModuleServer({
    root,
    port: channel.port1
  });
  try {
    await new Promise(resolve => setTimeout(resolve, WATCH_SETTLE_MILLISECONDS));
    const watched = Object.keys(server.watcher.getWatched()).map(folder => path.relative(root, folder));
    assert.ok(watched.includes("src"));
    for (const folder of ["dist", ".worktrees", ".winapp"]) {
      assert.deepEqual(watched.filter(watchedFolder => watchedFolder.startsWith(folder)), []);
    }
  } finally {
    await server.close();
    channel.port2.close();
    rmSync(root, {
      recursive: true,
      force: true
    });
  }
});

test("a root inside a worktrees folder is still watched", async () => {
  const outer = mkdtempSync(path.join(tmpdir(), "winui-server-"));
  const root = path.join(outer, ".worktrees", "branch");
  mkdirSync(path.join(root, "src"), { recursive: true });
  writeFileSync(path.join(root, "src", "file.ts"), "export const a = 1;\n");
  const channel = new MessageChannel();
  const server = await startModuleServer({
    root,
    port: channel.port1
  });
  try {
    await new Promise(resolve => setTimeout(resolve, WATCH_SETTLE_MILLISECONDS));
    const watched = Object.keys(server.watcher.getWatched()).map(folder => path.relative(root, folder));
    assert.ok(watched.includes("src"));
  } finally {
    await server.close();
    channel.port2.close();
    rmSync(outer, {
      recursive: true,
      force: true
    });
  }
});
