import { createPromiseTimers } from "./promise-timers.ts";
import { createScheduler } from "./scheduler.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const MANY_TIMERS = 5000;
const SCHEDULER_URL = new URL("scheduler.ts", import.meta.url).href;

interface FakeState {
  time: number;
  alarmAt: number | undefined;
  queued: (() => void)[];
  armCount: number;
  fire: () => void;
}

function createFakeDriver() {
  const state: FakeState = {
    time: 0,
    alarmAt: undefined,
    queued: [],
    armCount: 0,
    fire: () => undefined
  };
  const scheduler = createScheduler(fire => {
    state.fire = fire;
    return {
      now: () => state.time,
      arm(delay) {
        state.alarmAt = state.time + delay;
        state.armCount += 1;
      },
      disarm() {
        state.alarmAt = undefined;
      },
      enqueue(callback) {
        state.queued.push(callback);
      }
    };
  });

  function flush() {
    for (let batch = state.queued.splice(0); batch.length > 0; batch = state.queued.splice(0)) {
      for (const callback of batch) {
        callback();
      }
    }
  }

  function advance(milliseconds: number) {
    const target = state.time + milliseconds;
    flush();
    for (let alarm = state.alarmAt; alarm !== undefined && alarm <= target; alarm = state.alarmAt) {
      state.time = Math.max(state.time, alarm);
      state.alarmAt = undefined;
      state.fire();
      flush();
    }

    state.time = target;
  }

  return {
    scheduler,
    state,
    advance,
    flush
  };
}

test("timers fire in due order, and in creation order when due together", () => {
  const { scheduler, advance } = createFakeDriver();
  const order: string[] = [];
  scheduler.setTimeout(() => order.push("late"), 30);
  scheduler.setTimeout(() => order.push("first"), 10);
  scheduler.setTimeout(() => order.push("second"), 10);
  scheduler.setTimeout(() => order.push("early"), 5);
  advance(100);
  assert.deepEqual(order, ["early", "first", "second", "late"]);
});

test("a timer does not fire before its delay", () => {
  const { scheduler, advance } = createFakeDriver();
  let count = 0;
  scheduler.setTimeout(() => {
    count += 1;
  }, 50);
  advance(49);
  assert.equal(count, 0);
  advance(1);
  assert.equal(count, 1);
  advance(1000);
  assert.equal(count, 1, "a timeout fires once");
});

test("extra arguments and this reach the callback", () => {
  const { scheduler, advance } = createFakeDriver();
  const seen: unknown[] = [];
  const timeout = scheduler.setTimeout(function recorder(this: unknown, first: number, second: string) {
    seen.push(this, first, second);
  }, 1, 7, "x");
  advance(1);
  assert.deepEqual(seen, [timeout, 7, "x"]);
});

test("delays that are not valid become 1 ms", () => {
  const { scheduler, advance } = createFakeDriver();
  const order: string[] = [];
  scheduler.setTimeout(() => order.push("nan"), Number.NaN);
  scheduler.setTimeout(() => order.push("negative"), -5);
  scheduler.setTimeout(() => order.push("huge"), 2 ** 32);
  scheduler.setTimeout(() => order.push("none"));
  advance(1);
  assert.deepEqual(order, ["nan", "negative", "huge", "none"]);
});

test("an interval repeats until cleared, also from its own callback", () => {
  const { scheduler, advance } = createFakeDriver();
  let count = 0;
  const interval = scheduler.setInterval(() => {
    count += 1;

    const isThird = count === 3;
    if (isThird) {
      scheduler.clearInterval(interval);
    }
  }, 10);
  advance(1000);
  assert.equal(count, 3);
});

test("clearTimeout stops a timer, by object, by id and by string id", () => {
  const { scheduler, advance } = createFakeDriver();
  let count = 0;
  function bump() {
    count += 1;
  }
  const byObject = scheduler.setTimeout(bump, 5);
  const byId = scheduler.setTimeout(bump, 5);
  const byString = scheduler.setTimeout(bump, 5);
  scheduler.clearTimeout(byObject);
  scheduler.clearTimeout(Number(byId));
  scheduler.clearTimeout(String(Number(byString)));
  scheduler.clearTimeout(undefined);
  scheduler.clearTimeout(12_345);
  advance(100);
  assert.equal(count, 0);
});

test("a timer cleared by an earlier callback of the same turn never fires", () => {
  const { scheduler, advance } = createFakeDriver();
  const order: string[] = [];
  const victim = scheduler.setTimeout(() => order.push("victim"), 10);
  scheduler.setTimeout(() => {
    order.push("killer");
    victim.close();
  }, 5);
  advance(10);
  assert.deepEqual(order, ["killer"]);
});

test("refresh starts the wait again, also for a timer that fired", () => {
  const { scheduler, advance } = createFakeDriver();
  let count = 0;
  const timeout = scheduler.setTimeout(() => {
    count += 1;
  }, 10);
  advance(8);
  timeout.refresh();
  advance(8);
  assert.equal(count, 0, "refreshed at 8, so due at 18");
  advance(2);
  assert.equal(count, 1);
  timeout.refresh();
  advance(10);
  assert.equal(count, 2, "a fired timeout is scheduled once more");
});

test("ref, unref and hasRef report the last call, and an unref'd timer still fires", () => {
  const { scheduler, advance } = createFakeDriver();
  let isFired = false;
  const timeout = scheduler.setTimeout(() => {
    isFired = true;
  }, 1);
  assert.equal(timeout.hasRef(), true);
  assert.equal(timeout.unref(), timeout);
  assert.equal(timeout.hasRef(), false);
  assert.equal(timeout.ref().hasRef(), true);
  timeout.unref();
  advance(1);
  assert.equal(isFired, true);
});

test("a timer converts to its id and is cleared by it", () => {
  const { scheduler } = createFakeDriver();
  const first = scheduler.setTimeout(() => undefined, 1);
  const second = scheduler.setTimeout(() => undefined, 1);
  assert.equal(typeof +first, "number");
  assert.notEqual(+first, +second);
  assert.equal(`${second}`, String(+second));
});

test("timers nested more than five deep wait at least 4 ms", () => {
  const { scheduler, advance, state } = createFakeDriver();
  const times: number[] = [];
  function chain() {
    times.push(state.time);
    scheduler.setTimeout(chain, 1);
  }

  scheduler.setTimeout(chain, 1);
  advance(60);
  const gaps = times.slice(1).map((time, index) => time - (times[index] ?? 0));
  assert.deepEqual(gaps.slice(0, 4), [1, 1, 1, 1]);
  assert.ok(gaps.slice(5).every(gap => gap >= 4), `late gaps ${gaps.join(",")}`);
});

test("an interval is clamped the same way", () => {
  const { scheduler, advance, state } = createFakeDriver();
  const times: number[] = [];
  const interval = scheduler.setInterval(() => {
    times.push(state.time);

    const isTwelfth = times.length === 12;
    if (isTwelfth) {
      interval.close();
    }
  }, 1);
  advance(100);
  const gaps = times.slice(1).map((time, index) => time - (times[index] ?? 0));
  assert.ok(gaps.slice(6).every(gap => gap >= 4), `late gaps ${gaps.join(",")}`);
});

test("a throwing callback does not stop the others and is rethrown as an uncaught exception", () => {
  const script = `
    import { createScheduler } from ${JSON.stringify(SCHEDULER_URL)};
    const queued = [];
    let fire;
    let alarm;
    let time = 0;
    const scheduler = createScheduler(realFire => {
      fire = realFire;
      return { now: () => time, arm: delay => { alarm = delay; }, disarm: () => {}, enqueue: callback => queued.push(callback) };
    });
    process.on("uncaughtException", error => console.log("uncaught " + error.message));
    scheduler.setTimeout(() => { throw new Error("boom"); }, 1);
    scheduler.setTimeout(() => console.log("after"), 1);
    time = 10;
    fire();
  `;
  const result = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(result.stdout.trim().split("\n").sort().join("|"), "after|uncaught boom", result.stderr);
});

test("setTimeout rejects what is not a function", () => {
  const { scheduler } = createFakeDriver();
  assert.throws(() => scheduler.setTimeout("alert(1)" as never, 1), { code: "ERR_INVALID_ARG_TYPE" });
  assert.throws(() => scheduler.setImmediate(undefined as never), { code: "ERR_INVALID_ARG_TYPE" });
});

test("setImmediate runs on the next turn in order, and what it queues runs the turn after", () => {
  const { scheduler, flush } = createFakeDriver();
  const order: string[] = [];
  scheduler.setImmediate(() => {
    order.push("a");
    scheduler.setImmediate(() => order.push("c"));
  });
  scheduler.setImmediate(() => order.push("b"));
  assert.deepEqual(order, []);
  flush();
  assert.deepEqual(order, ["a", "b", "c"]);
});

test("clearImmediate stops an immediate", () => {
  const { scheduler, flush } = createFakeDriver();
  let isFired = false;
  const immediate = scheduler.setImmediate(() => {
    isFired = true;
  });
  scheduler.clearImmediate(immediate);
  flush();
  assert.equal(isFired, false);
});

test("many timers fire in order, and clearing most of them leaves the rest", () => {
  const { scheduler, advance } = createFakeDriver();
  const fired: number[] = [];
  function schedule(_: unknown, index: number) {
    return scheduler.setTimeout(() => fired.push(index), MANY_TIMERS - index);
  }

  const timeouts = Array.from({ length: MANY_TIMERS }, schedule);
  for (const [index, timeout] of timeouts.entries()) {
    const isDropped = index % 10 !== 0;
    if (isDropped) {
      timeout.close();
    }
  }

  advance(MANY_TIMERS + 1);
  const expected = Array.from({ length: MANY_TIMERS / 10 }, (_, index) => MANY_TIMERS - 10 - index * 10);
  assert.deepEqual(fired, expected);
});

test("setting a timer re-arms the alarm only when it is earlier than the one set", () => {
  const { scheduler, state } = createFakeDriver();
  scheduler.setTimeout(() => undefined, 10);
  const afterFirst = state.armCount;
  scheduler.setTimeout(() => undefined, 20);
  assert.equal(state.armCount, afterFirst, "a later timer needs no new alarm");
  scheduler.setTimeout(() => undefined, 5);
  assert.equal(state.armCount, afterFirst + 1);
  assert.equal(state.alarmAt, 5);
});

test("stopAll cancels timers, intervals and immediates, and refuses new ones until reattach", () => {
  const { scheduler, advance, state } = createFakeDriver();
  let count = 0;
  function bump() {
    count += 1;
  }
  scheduler.setTimeout(bump, 1);
  scheduler.setInterval(bump, 1);
  scheduler.setImmediate(bump);
  scheduler.stopAll();
  assert.equal(state.alarmAt, undefined);
  scheduler.setTimeout(bump, 1);
  scheduler.setImmediate(bump);
  advance(100);
  assert.equal(count, 0);
  scheduler.reattach();
  scheduler.setTimeout(bump, 1);
  advance(1);
  assert.equal(count, 1);
});

test("a timer that is set while the callbacks of a turn run fires on a later turn", () => {
  const { scheduler, advance } = createFakeDriver();
  const order: string[] = [];
  scheduler.setTimeout(() => {
    order.push("outer");
    scheduler.setTimeout(() => order.push("inner"), 1);
  }, 1);
  advance(1);
  assert.deepEqual(order, ["outer"]);
  advance(1);
  assert.deepEqual(order, ["outer", "inner"]);
});

test("timers/promises: a delay resolves with its value", async () => {
  const { scheduler, advance } = createFakeDriver();
  const promises = createPromiseTimers(scheduler);
  const delayed = promises.setTimeout(20, "value");
  advance(20);
  assert.equal(await delayed, "value");
  const yielded = promises.scheduler.yield();
  advance(0);
  await yielded;
});

test("timers/promises: an abort rejects with an AbortError and cancels the timer", async () => {
  const { scheduler, advance, state } = createFakeDriver();
  const promises = createPromiseTimers(scheduler);
  const controller = new AbortController();
  const delayed = promises.setTimeout(20, "value", { signal: controller.signal });
  controller.abort();
  await assert.rejects(delayed, {
    name: "AbortError",
    code: "ABORT_ERR"
  });
  advance(100);
  assert.equal(state.alarmAt, undefined);
  await assert.rejects(promises.setTimeout(1, "x", { signal: controller.signal }), { name: "AbortError" });
});

test("timers/promises: setInterval yields each tick and ends on abort", async () => {
  const { scheduler, advance } = createFakeDriver();
  const promises = createPromiseTimers(scheduler);
  const controller = new AbortController();
  const seen: string[] = [];
  const consumer = (async () => {
    for await (const value of promises.setInterval(10, "tick", { signal: controller.signal })) {
      seen.push(String(value));
      const isThird = seen.length === 3;
      if (isThird) {
        controller.abort();
      }
    }
  })();
  for (let i = 0; i < 4; i += 1) {
    advance(10);
    await Promise.resolve();
    await Promise.resolve();
  }

  await assert.rejects(consumer, { name: "AbortError" });
  assert.deepEqual(seen, ["tick", "tick", "tick"]);
});
