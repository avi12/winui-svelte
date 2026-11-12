import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const { withUpdateLock, lockPath } = await import("./update-lock.ts");

const DEAD_PID = 2_147_483_646;

test("a second holder is refused while the first runs, a dead owner is taken over", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lock-"));
  try {
    await withUpdateLock({
      root,
      async run() {
        await assert.rejects(
          withUpdateLock({
            root,
            run: () => Promise.resolve()
          }), { name: "UpdateLockedError" }
        );
      }
    });
    await mkdir(path.dirname(lockPath(root)), {
      recursive: true
    });
    await writeFile(lockPath(root), String(DEAD_PID));
    const result = await withUpdateLock({
      root,
      run: () => Promise.resolve("ran")
    });
    assert.equal(result, "ran");
  } finally {
    await rm(root, {
      recursive: true,
      force: true
    });
  }
});
