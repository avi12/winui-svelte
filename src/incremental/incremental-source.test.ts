import type { IncrementalSourceOptions } from "./incremental-source.svelte.ts";
import type { IncrementalState } from "./state.ts";
import { IncrementalStatus } from "./state.ts";
import "#src/state/test-support/svelte-runes.js";
import assert from "node:assert/strict";
import { test } from "node:test";

const { createIncrementalSource } = await import("./incremental-source.svelte.ts");

const BATCH_SIZE = 3;

interface Call {
  offset: number;
  count: number;
  signal: AbortSignal;
  resolve(batch: readonly number[]): void;
  reject(error: unknown): void;
}

// A source whose loads wait for the test to settle them.
function pending(options: Partial<IncrementalSourceOptions<number>> = {}) {
  const calls: Call[] = [];
  const source = createIncrementalSource<number>({
    batchSize: BATCH_SIZE,
    threshold: 1,
    ...options,
    load: ({ offset, count, signal }) => new Promise((resolve, reject) => {
      calls.push({
        offset,
        count,
        signal,
        resolve,
        reject
      });
    })
  });
  return {
    source,
    calls
  };
}

function statusOf(source: { readonly state: IncrementalState }) {
  return source.state.status;
}

function errorMessageOf(source: { readonly state: IncrementalState }) {
  const { state } = source;
  return state.status === IncrementalStatus.ERROR ? state.error.message : undefined;
}

function lastCall(calls: readonly Call[]) {
  const call = calls.at(-1);
  const isStarted = call !== undefined;
  if (!isStarted) {
    throw new Error("no load was started");
  }

  return call;
}

test("a batch is appended and the source is idle again", async () => {
  const { source, calls } = pending();
  const loading = source.loadMore();
  assert.equal(statusOf(source), IncrementalStatus.LOADING);
  assert.deepEqual([lastCall(calls).offset, lastCall(calls).count], [0, BATCH_SIZE]);
  lastCall(calls).resolve([1, 2, 3]);
  await loading;
  assert.deepEqual(source.items, [1, 2, 3]);
  assert.equal(statusOf(source), IncrementalStatus.IDLE);
  const next = source.loadMore();
  assert.equal(lastCall(calls).offset, BATCH_SIZE);
  lastCall(calls).resolve([4]);
  await next;
  assert.equal(statusOf(source), IncrementalStatus.DONE);
});

test("loads in flight are de-duplicated", async () => {
  const { source, calls } = pending();
  const first = source.loadMore();
  const second = source.loadMore();
  source.realized({ index: 0 });
  assert.equal(calls.length, 1);
  assert.equal(first, second);
  lastCall(calls).resolve([1, 2, 3]);
  await first;
});

test("a realized item loads only near the end", async () => {
  const { source, calls } = pending();
  source.realized({ index: 0 });
  lastCall(calls).resolve([1, 2, 3]);
  await source.loadMore();
  assert.equal(calls.length, 1);
  source.realized({ index: 0 });
  assert.equal(calls.length, 1);
  source.realized({ index: 2 });
  assert.equal(calls.length, 2);
});

test("a short or empty batch is the last, and a done source loads nothing", async () => {
  const { source, calls } = pending();
  const loading = source.loadMore();
  lastCall(calls).resolve([]);
  await loading;
  assert.equal(statusOf(source), IncrementalStatus.DONE);
  await source.loadMore();
  source.realized({ index: 0 });
  assert.equal(calls.length, 1);
});

test("isLast decides when the size cannot", async () => {
  const { source, calls } = pending({
    isLast: ({ items }) => items.length >= BATCH_SIZE
  });
  const loading = source.loadMore();
  lastCall(calls).resolve([1, 2, 3]);
  await loading;
  assert.equal(statusOf(source), IncrementalStatus.DONE);
});

test("a failure is the error state, kept until retry, and retry loads the same batch", async () => {
  const { source, calls } = pending();
  const loading = source.loadMore();
  lastCall(calls).reject(new Error("offline"));
  await loading;
  assert.equal(statusOf(source), IncrementalStatus.ERROR);
  assert.equal(errorMessageOf(source), "offline");
  source.realized({ index: 0 });
  await source.loadMore();
  assert.equal(calls.length, 1);
  const retrying = source.retry();
  assert.equal(calls.length, 2);
  assert.equal(lastCall(calls).offset, 0);
  lastCall(calls).resolve([1, 2, 3]);
  await retrying;
  assert.deepEqual(source.items, [1, 2, 3]);
});

test("a thrown value that is no Error becomes one", async () => {
  const { source, calls } = pending();
  const loading = source.loadMore();
  lastCall(calls).reject("boom");
  await loading;
  assert.equal(errorMessageOf(source), "boom");
});

test("cancel aborts the load, drops its result and leaves the source idle", async () => {
  const { source, calls } = pending();
  const loading = source.loadMore();
  const { signal } = lastCall(calls);
  source.cancel();
  assert.ok(signal.aborted);
  assert.equal(statusOf(source), IncrementalStatus.IDLE);
  lastCall(calls).resolve([1, 2, 3]);
  await loading;
  assert.deepEqual(source.items, []);
  assert.equal(statusOf(source), IncrementalStatus.IDLE);
});

test("reset clears the items and a late result of the old load is dropped", async () => {
  const { source, calls } = pending();
  const first = source.loadMore();
  lastCall(calls).resolve([1, 2, 3]);
  await first;
  const stale = source.loadMore();
  const staleCall = lastCall(calls);
  source.reset();
  assert.deepEqual(source.items, []);
  const fresh = source.loadMore();
  assert.equal(lastCall(calls).offset, 0);
  staleCall.resolve([4, 5, 6]);
  await stale;
  lastCall(calls).resolve([7]);
  await fresh;
  assert.deepEqual(source.items, [7]);
  assert.equal(statusOf(source), IncrementalStatus.DONE);
});

test("a batch size that is no positive integer is refused", () => {
  assert.throws(() => pending({ batchSize: 0 }), RangeError);
  assert.throws(() => pending({ batchSize: 1.5 }), RangeError);
});
