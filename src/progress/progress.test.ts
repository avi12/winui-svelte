import { ProgressState } from "./progress-state.ts";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The operation, the registry and its scopes, the taskbar and tray text, and
// the file read, with no window: stand-ins for the taskbar button.

const { ProgressOperation } = await import("./progress-operation.ts");
const { ProgressRegistry } = await import("./progress-registry.ts");
const { progressText } = await import("./progress-text.ts");
const { bindTaskbarProgress } = await import("./taskbar-progress.ts");
const { trackOperation } = await import("./track-operation.ts");
const { FileSystemFileHandle } = await import("#src/web-apis/file-system.js");

const TOTAL = 200;
const HALF = 100;

function isolated(options: ConstructorParameters<typeof ProgressOperation>[0] = {}) {
  return new ProgressOperation({
    registry: false,
    ...options
  });
}

function fakeTaskbar() {
  const calls: {
    state: string;
    value?: number | undefined;
  }[] = [];
  return {
    calls,
    setProgress(options: {
      state: string;
      value?: number | undefined;
    }) {
      calls.push(options);
    }
  };
}

test("an operation fires the platform events in order and resolves its result", async () => {
  const operation = isolated({ total: TOTAL });
  const seen: string[] = [];
  for (const type of ["loadstart", "progress", "load", "error", "abort", "loadend"]) {
    operation.addEventListener(type, () => seen.push(type));
  }

  operation.start();
  operation.update({ loaded: HALF });
  assert.equal(operation.value, 0.5);
  assert.equal(operation.isIndeterminate, false);
  operation.complete(undefined);
  await operation;
  assert.deepEqual(seen, ["loadstart", "progress", "load", "loadend"]);
  assert.equal(operation.state, ProgressState.COMPLETE);
  assert.equal(operation.value, 1);
});

test("an unknown total is indeterminate, and the on-handlers in the options run", () => {
  const types: string[] = [];
  const operation = isolated({
    onprogress: event => types.push(`${event.type}:${event.lengthComputable}`)
  });
  operation.start();
  operation.update({ loaded: 5 });
  assert.equal(operation.isIndeterminate, true);
  assert.deepEqual(types, ["progress:false"]);
  assert.deepEqual(operation.barProps, {
    value: 0,
    maximum: 1,
    isIndeterminate: true,
    showPaused: false,
    showError: false
  });
});

test("cancel aborts the signal, rejects the result and fires abort then loadend", async () => {
  const operation = isolated();
  const seen: string[] = [];
  operation.onabort = () => seen.push("abort");
  operation.onloadend = () => seen.push("loadend");
  operation.start();
  operation.cancel();
  await assert.rejects(async () => await operation, { name: "AbortError" });
  assert.equal(operation.signal.aborted, true);
  assert.equal(operation.state, ProgressState.CANCELED);
  assert.deepEqual(seen, ["abort", "loadend"]);
});

test("an outside signal cancels it, and failing keeps the error and allows a retry", async () => {
  const controller = new AbortController();
  const outside = isolated({ signal: controller.signal });
  controller.abort();
  assert.equal(outside.state, ProgressState.CANCELED);

  const failing = isolated();
  failing.start();
  failing.fail(new Error("disk full"));
  assert.equal(failing.showError, true);
  await assert.rejects(async () => await failing, /disk full/u);
  failing.resume();
  assert.equal(failing.state, ProgressState.RUNNING);
  assert.equal(failing.error, undefined);
});

test("it is a Svelte store", () => {
  const operation = isolated({ total: TOTAL });
  const values: number[] = [];
  const stop = operation.subscribe(snapshot => values.push(snapshot.value));
  operation.start();
  operation.update({ loaded: HALF });
  stop();
  operation.update({ loaded: TOTAL });
  assert.deepEqual(values, [0, 0, 0.5]);
});

test("the registry lists operations itself, drops finished ones, keeps failed ones and aggregates", async () => {
  const registry = new ProgressRegistry();
  const first = new ProgressOperation({
    registry,
    total: TOTAL,
    label: "a.bin"
  });
  const second = new ProgressOperation({
    registry,
    total: TOTAL,
    label: "b.bin"
  });
  first.start();
  second.start();
  first.update({ loaded: HALF });
  assert.equal(registry.count, 2);
  assert.equal(registry.value, 0.25);
  assert.equal(progressText(registry.snapshot), "2 operations - 25%");

  first.complete(undefined);
  assert.deepEqual(registry.operations, [second]);
  assert.equal(progressText(registry.snapshot), "b.bin - 0%");

  second.fail(new Error("x"));
  await assert.rejects(async () => await second);
  assert.equal(registry.snapshot.state, ProgressState.ERROR);
  assert.equal(registry.showError, true);
  assert.equal(registry.count, 0);
  registry.clearFailed();
  assert.equal(registry.operations.length, 0);
  assert.equal(registry.snapshot.state, ProgressState.IDLE);
});

test("a scoped registry shows only its group, for two tray icons or two windows", () => {
  const registry = new ProgressRegistry();
  const downloads = registry.where("downloads");
  const uploads = registry.where(operation => operation.group === "uploads");
  const download = new ProgressOperation({
    registry,
    group: "downloads",
    total: TOTAL
  });
  const upload = new ProgressOperation({
    registry,
    group: "uploads"
  });
  download.start();
  upload.start();
  download.update({ loaded: HALF });
  assert.equal(registry.count, 2);
  assert.deepEqual(downloads.operations, [download]);
  assert.deepEqual(uploads.operations, [upload]);
  assert.equal(downloads.value, 0.5);
  assert.equal(uploads.isIndeterminate, true);

  const listened: number[] = [];
  downloads.subscribe(snapshot => listened.push(snapshot.count));
  download.complete(undefined);
  assert.equal(downloads.count, 0);
  assert.equal(uploads.count, 1);
  assert.equal(listened.at(-1), 0);
  downloads.dispose();
  uploads.dispose();
});

test("the taskbar follows a source: marquee, bar, paused, error, cleared", () => {
  const taskbar = fakeTaskbar();
  const operation = isolated();
  const stop = bindTaskbarProgress({
    source: operation,
    taskbar
  });
  operation.start();
  operation.update({
    loaded: 0,
    total: TOTAL
  });
  operation.update({ loaded: HALF });
  operation.update({ loaded: HALF });
  operation.pause();
  operation.resume();
  operation.fail(new Error("x"));
  assert.deepEqual(taskbar.calls.map(call => call.state), ["indeterminate", "normal", "normal", "paused", "normal", "error"]);
  assert.equal(taskbar.calls[2]?.value, 0.5);
  stop();
  assert.equal(taskbar.calls.at(-1)?.state, "none");
});

test("trackOperation runs the work, reports and settles", async () => {
  const registry = new ProgressRegistry();
  const operation = trackOperation({
    registry,
    label: "copy",
    async run(running) {
      running.update({
        loaded: 1,
        total: 2
      });
      await Promise.resolve();
      return "done";
    }
  });
  assert.equal(operation.state, ProgressState.RUNNING);
  assert.equal(await operation, "done");
  assert.equal(registry.count, 0);

  const failing = trackOperation({
    registry,
    run: () => Promise.reject(new Error("boom"))
  });
  await assert.rejects(async () => await failing, /boom/u);
  assert.equal(failing.state, ProgressState.ERROR);
});

test("handle.read reads a file in chunks with progress and cancels", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "progress-"));
  try {
    const target = path.join(folder, "data.bin");
    const size = 2_500_000;
    await writeFile(target, Buffer.alloc(size, 1));
    const loadedValues: number[] = [];
    const read = new FileSystemFileHandle(target).read({
      registry: false,
      onprogress: event => loadedValues.push(event.loaded)
    });
    const file = await read;
    assert.equal(file.size, size);
    assert.equal(read.state, ProgressState.COMPLETE);
    assert.ok(loadedValues.length >= 3);
    assert.equal(loadedValues.at(-1), size);

    const canceled = new FileSystemFileHandle(target).read({ registry: false });
    canceled.cancel();
    await assert.rejects(async () => await canceled, { name: "AbortError" });
  } finally {
    await rm(folder, {
      recursive: true,
      force: true
    });
  }
});
