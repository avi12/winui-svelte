import { UiaTimeout } from "./client.ts";
import type { UiaWorkerResponse } from "./worker-job.ts";
import { createUiaWorker } from "./worker.ts";
import type { UiaWorkerHandle } from "./worker.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The host side of the worker: a call that outlives its hard deadline rejects
// with UiaTimeout, the worker is ended, and the next call gets a new one.

function fakeWorkers() {
  const spawned: Array<{
    isTerminated: boolean;
    isHung: boolean;
  }> = [];
  function spawn() {
    const state = {
      isTerminated: false,
      isHung: spawned.length === 0
    };
    spawned.push(state);
    let onMessage: ((response: UiaWorkerResponse) => void) | undefined;
    const handle: UiaWorkerHandle = {
      postMessage({ id }) {
        if (!state.isHung) {
          onMessage?.({
            id,
            text: null
          });
        }
      },
      on(event: string, listener: never) {
        const isEventMessage = event === "message";
        if (isEventMessage) {
          onMessage = listener;
        }

        return handle;
      },
      terminate() {
        state.isTerminated = true;
      }
    };
    return handle;
  }

  return {
    spawned,
    spawn
  };
}

test("a hung target rejects with UiaTimeout, and the next call works on a new worker", async () => {
  const fake = fakeWorkers();
  const worker = createUiaWorker({ spawn: fake.spawn });
  await assert.rejects(
    worker.readText({
      target: "foreground",
      hardMilliseconds: 30
    }), UiaTimeout
  );
  assert.equal(fake.spawned[0]?.isTerminated, true);
  const text = await worker.readText({
    target: "foreground",
    hardMilliseconds: 1000
  });
  assert.equal(text, null);
  assert.equal(fake.spawned.length, 2);
  worker.close();
  assert.equal(fake.spawned[1]?.isTerminated, true);
});
