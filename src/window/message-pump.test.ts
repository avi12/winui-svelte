import { createMessagePump, Dispatched, dispatchNextMessage } from "./message-pump.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const FLOOD = 50;
const LIBUV_BACKLOG = 1000;
const CAP_MILLISECONDS = 8;

// A message source that answers from a script, and a libuv that takes turns:
// each turn runs the callbacks that were ready when it began (callbacks they
// queue wait for the next turn, as in libuv), then the immediates.
function createFakes({ script, idleMilliseconds }: {
  script: (iSlice: number) => Dispatched;
  idleMilliseconds?: () => number;
}) {
  const log: string[] = [];
  const waits: number[] = [];
  const ready: (() => void)[] = [];
  let immediates: (() => void)[] = [];
  let iSlice = 0;
  let quits = 0;
  const pump = createMessagePump({
    source: {
      dispatchNext() {
        const index = iSlice;
        iSlice += 1;
        const found = script(index);
        log.push(found);
        return found;
      },
      wait(milliseconds) {
        waits.push(milliseconds);
      },
      idleMilliseconds
    },
    schedule(callback) {
      immediates.push(callback);
    },
    onQuit() {
      quits += 1;
    }
  });
  return {
    pump,
    log,
    waits,
    ready,
    get quits() {
      return quits;
    },
    get hasImmediates() {
      return immediates.length > 0;
    },
    turn() {
      for (const callback of ready.splice(0)) {
        callback();
      }

      const batch = immediates;
      immediates = [];
      for (const callback of batch) {
        callback();
      }
    },
    turns(count: number) {
      for (let i = 0; i < count; i += 1) {
        this.turn();
      }
    }
  };
}

test("a slice dispatches one message, then libuv takes a turn", () => {
  const fakes = createFakes({ script: () => Dispatched.MESSAGE });
  const order: string[] = [];
  fakes.pump.start();
  fakes.ready.push(() => order.push("libuv"));
  fakes.turn();
  assert.deepEqual(fakes.log, [Dispatched.MESSAGE, Dispatched.MESSAGE], "one message per slice");
  assert.deepEqual(order, ["libuv"], "libuv ran between the slices");
});

test("an idle pump sleeps longer each slice up to a cap, and a message starts the backoff over", () => {
  const fakes = createFakes({ script: iSlice => (iSlice === 6 ? Dispatched.MESSAGE : Dispatched.NOTHING) });
  fakes.pump.start();
  fakes.turns(9);
  assert.deepEqual(fakes.waits, [1, 2, 4, 8, 8, 8, 1, 2, 4]);
  assert.ok(fakes.waits.every(milliseconds => milliseconds <= CAP_MILLISECONDS), "never sleeps beyond the cap");
});

test("a source that hears libuv says how long the pump sleeps, with no backoff", () => {
  const sleeps = [250, 16, 250];
  let iSleep = 0;
  const fakes = createFakes({
    script: () => Dispatched.NOTHING,
    idleMilliseconds() {
      const milliseconds = sleeps[iSleep] ?? 0;
      iSleep += 1;
      return milliseconds;
    }
  });
  fakes.pump.start();
  fakes.turns(2);
  assert.deepEqual(fakes.waits, sleeps);
});

test("a flood of messages does not starve libuv", () => {
  const fakes = createFakes({ script: () => Dispatched.MESSAGE });
  let served = 0;
  fakes.pump.start();
  for (let i = 0; i < FLOOD; i += 1) {
    fakes.ready.push(() => {
      served += 1;
    });
    fakes.turn();
  }

  assert.equal(served, FLOOD, "every turn ran the libuv work that was ready");
  assert.equal(fakes.log.length, FLOOD + 1, "and a message was dispatched on every turn");
  assert.deepEqual(fakes.waits, [], "a busy pump never sleeps");
});

test("a flood of libuv callbacks does not starve messages", () => {
  const fakes = createFakes({ script: () => Dispatched.MESSAGE });
  let served = 0;
  function again() {
    served += 1;
    fakes.ready.push(again);
  }

  for (let i = 0; i < LIBUV_BACKLOG; i += 1) {
    fakes.ready.push(again);
  }

  fakes.pump.start();
  fakes.turns(FLOOD);
  assert.equal(served, FLOOD * LIBUV_BACKLOG, "libuv kept a full backlog on every turn");
  assert.equal(fakes.log.length, FLOOD + 1, "yet a message was dispatched on every turn");
});

test("the quit message ends the pump: it calls back once and schedules nothing more", () => {
  const fakes = createFakes({ script: iSlice => (iSlice === 2 ? Dispatched.QUIT : Dispatched.MESSAGE) });
  fakes.pump.start();
  fakes.turns(5);
  assert.equal(fakes.quits, 1);
  assert.equal(fakes.pump.isRunning, false);
  assert.equal(fakes.hasImmediates, false, "the loop it held alive can end");
  assert.equal(fakes.log.length, 3, "nothing is dispatched after the quit");
});

test("stop ends the pump without calling back", () => {
  const fakes = createFakes({ script: () => Dispatched.MESSAGE });
  fakes.pump.start();
  fakes.pump.stop();
  fakes.turns(3);
  assert.equal(fakes.quits, 0);
  assert.equal(fakes.log.length, 1);
  assert.equal(fakes.hasImmediates, false, "the slice already scheduled found the pump stopped and scheduled nothing");
});

test("starting twice runs one chain of slices", () => {
  const fakes = createFakes({ script: () => Dispatched.NOTHING });
  fakes.pump.start();
  fakes.pump.start();
  fakes.turns(3);
  assert.equal(fakes.log.length, 4);
});

test("a slice that throws is followed by another", () => {
  const fakes = createFakes({
    script(iSlice) {
      const isFirst = iSlice === 0;
      if (isFirst) {
        throw new Error("a handler failed");
      }

      return Dispatched.NOTHING;
    }
  });
  assert.throws(() => fakes.pump.start(), /a handler failed/u);
  fakes.turns(2);
  assert.equal(fakes.log.length, 2, "the pump kept going");
});

function createQueue({ isWaiting, isQuit = false, isConsumed = false, isHooked = false }: {
  isWaiting: boolean;
  isQuit?: boolean;
  isConsumed?: boolean;
  isHooked?: boolean;
}) {
  const calls: string[] = [];
  return {
    calls,
    queue: {
      take() {
        calls.push("take");
        return isWaiting;
      },
      isQuit() {
        calls.push("isQuit");
        return isQuit;
      },
      isHandledByHook() {
        calls.push("hook");
        return isHooked;
      },
      isConsumedByContent() {
        calls.push("content");
        return isConsumed;
      },
      deliver() {
        calls.push("deliver");
      }
    }
  };
}

test("a message is offered to the content first, then translated and dispatched", () => {
  const { queue, calls } = createQueue({ isWaiting: true });
  assert.equal(dispatchNextMessage(queue), Dispatched.MESSAGE);
  assert.deepEqual(calls, ["take", "isQuit", "hook", "content", "deliver"]);
});

test("a message the content consumed is neither translated nor dispatched", () => {
  const { queue, calls } = createQueue({
    isWaiting: true,
    isConsumed: true
  });
  assert.equal(dispatchNextMessage(queue), Dispatched.MESSAGE);
  assert.deepEqual(calls, ["take", "isQuit", "hook", "content"]);
});

test("a message a hook handled reaches neither the content nor the window", () => {
  const { queue, calls } = createQueue({
    isWaiting: true,
    isHooked: true
  });
  assert.equal(dispatchNextMessage(queue), Dispatched.MESSAGE);
  assert.deepEqual(calls, ["take", "isQuit", "hook"]);
});

test("an empty queue and the quit message reach neither the content nor the window", () => {
  const empty = createQueue({ isWaiting: false });
  assert.equal(dispatchNextMessage(empty.queue), Dispatched.NOTHING);
  assert.deepEqual(empty.calls, ["take"]);
  const quit = createQueue({
    isWaiting: true,
    isQuit: true
  });
  assert.equal(dispatchNextMessage(quit.queue), Dispatched.QUIT);
  assert.deepEqual(quit.calls, ["take", "isQuit"]);
});
