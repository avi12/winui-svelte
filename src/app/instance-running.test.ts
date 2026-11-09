import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

// The early claim on a plain thread, with no window and no UI thread: the pipe
// is real, so these run in any Windows session. A second process asks and claims.

const { claimInstance, createPipeSource } = await import("./single-instance.ts");
const { isInstanceRunning } = await import("./instance-running.ts");
const { currentUserSid, pipeNameFor } = await import("./instance-pipe.ts");

const ACTIVATION = {
  arguments: [],
  workingDirectory: "C:\\work"
};
const RELEASE_MILLISECONDS = 200;

function claim(key: string) {
  return claimInstance({
    key,
    source: createPipeSource(),
    activation: ACTIVATION,
    runOnUiThread: work => work(),
    onRedirect: () => undefined
  });
}

function settle() {
  return new Promise(resolve => setTimeout(resolve, RELEASE_MILLISECONDS));
}

test("the pipe name is stable for a user and a key, and differs for another of either", () => {
  const name = pipeNameFor({
    key: "a",
    sid: "S-1-5-21-1"
  });
  assert.equal(
    pipeNameFor({
      key: "a",
      sid: "S-1-5-21-1"
    }), name
  );
  assert.notEqual(
    pipeNameFor({
      key: "b",
      sid: "S-1-5-21-1"
    }), name
  );
  assert.notEqual(
    pipeNameFor({
      key: "a",
      sid: "S-1-5-21-2"
    }), name
  );
  assert.match(currentUserSid(), /^S-1-/u);
});

test("an instance is running while a primary holds the key and not after it releases", async () => {
  const key = `test.${randomUUID()}`;
  assert.equal(isInstanceRunning({ key }), false);
  const single = claim(key);
  assert.equal(single.isPrimary, true);
  assert.equal(isInstanceRunning({ key }), true);
  single.release();
  await settle();
  assert.equal(isInstanceRunning({ key }), false);
});

test("a second process sees the running copy and is not primary", () => {
  const key = `test.${randomUUID()}`;
  const single = claim(key);
  const script = `
    const { claimInstance, createPipeSource } = await import(${JSON.stringify(pathToFileURL(`${import.meta.dirname}/single-instance.ts`).href)});
    const { isInstanceRunning } = await import(${JSON.stringify(pathToFileURL(`${import.meta.dirname}/instance-running.ts`).href)});
    const key = ${JSON.stringify(key)};
    const isRunning = isInstanceRunning({ key });
    const second = claimInstance({ key, source: createPipeSource(), activation: { arguments: [], workingDirectory: "." }, runOnUiThread: work => work(), onRedirect: () => undefined });
    console.log(JSON.stringify({ isRunning, isPrimary: second.isPrimary }));
    process.exit(0);
  `;
  try {
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
    assert.deepEqual(JSON.parse(output.trim().split("\n").at(-1) ?? ""), {
      isRunning: true,
      isPrimary: false
    });
  } finally {
    single.release();
  }
});
