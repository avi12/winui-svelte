import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import type { Report } from "./example-process.ts";
import { act, exists, read } from "./uia.ts";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

// The stores example (examples/stores) in a real WinUI window, off screen:
// svelte/store, the $store syntax, svelte/motion and svelte/reactivity run on
// this renderer. The example's own commands drive the state; the controls are
// read through UI Automation. Skipped where the Windows App SDK was not
// restored.

const TIMEOUT_MILLISECONDS = 300_000;
const POLL_MILLISECONDS = 100;
const POLL_ATTEMPTS = 100;
const FULL = 100;
const NAME_TYPED = "Grace";
const AMOUNT_TYPED = 7;
const COUNT_ASSIGNED = 5;
const STAMP_YEAR = 2030;

describe("stores", { skip: !IS_WINDOWS_APP_SDK_RESTORED }, () => {
  let example: ExampleProcess;

  async function stats() {
    return example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
  }

  async function until<T>({ produce, isDone }: {
    produce: () => Promise<T> | T;
    isDone: (value: T) => boolean;
  }) {
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      const value = await produce();
      const isReached = isDone(value);
      if (isReached) {
        return value;
      }

      await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
    }

    throw new Error("the example did not reach the expected state");
  }

  async function untilStats(isDone: (report: Report) => boolean) {
    return until({
      produce: stats,
      isDone
    });
  }

  function shown(id: string) {
    return read({
      pid: example.pid,
      id
    }).name;
  }

  async function shownEquals({ id, expected }: {
    id: string;
    expected: string;
  }) {
    await until({
      produce: () => shown(id),
      isDone: value => value === expected
    });
  }

  async function appears(id: string) {
    await until({
      produce: () => exists({
        pid: example.pid,
        id
      }),
      isDone: isThere => isThere
    });
  }

  function tally({ report, key }: {
    report: Report;
    key: string;
  }) {
    const tallies = report["tallies"];
    const isRecord = typeof tallies === "object" && tallies !== null && !Array.isArray(tallies);
    assert.ok(isRecord);
    return tallies[key];
  }

  function invoke(id: string) {
    act({
      pid: example.pid,
      id,
      action: "invoke"
    });
  }

  before(async () => {
    example = ExampleProcess.start({ entry: "examples/stores/main.ts" });
    await stats();
    await appears("count");
  }, { timeout: TIMEOUT_MILLISECONDS });

  after(() => {
    example.kill();
  });

  test("$store reads, store.update and $store = value write, and a derived follows", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    await shownEquals({
      id: "count",
      expected: "0"
    });
    invoke("increment");
    await shownEquals({
      id: "count",
      expected: "1"
    });
    await shownEquals({
      id: "double",
      expected: "2"
    });
    await shownEquals({
      id: "sum",
      expected: "4"
    });
    invoke("assign");
    await shownEquals({
      id: "count",
      expected: String(FULL)
    });
    await shownEquals({
      id: "double",
      expected: String(FULL * 2)
    });
    await shownEquals({
      id: "sum",
      expected: String(FULL + 3)
    });
  });

  test("a store as a prop, get(), a custom store and context", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    example.send({
      cmd: "assign",
      value: COUNT_ASSIGNED
    });
    await shownEquals({
      id: "reader",
      expected: String(COUNT_ASSIGNED)
    });
    await shownEquals({
      id: "count",
      expected: String(COUNT_ASSIGNED)
    });
    const report = await stats();
    assert.equal(report["count"], COUNT_ASSIGNED);
    assert.equal(report["double"], COUNT_ASSIGNED * 2);
    example.send({ cmd: "step" });
    await shownEquals({
      id: "stepper",
      expected: "5"
    });
    await shownEquals({
      id: "context",
      expected: "from context"
    });
    await shownEquals({
      id: "context-parent",
      expected: "from context"
    });
    assert.equal(
      tally({
        report: await stats(),
        key: "count"
      }), 4, "the text, the reader and the two derived stores"
    );
  });

  test("bind: writes into a store and reads back from it", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const { pid } = example;
    act({
      pid,
      id: "name",
      action: "set-value",
      value: NAME_TYPED
    });
    await untilStats(report => report["name"] === NAME_TYPED);
    await shownEquals({
      id: "name-echo",
      expected: NAME_TYPED
    });
    act({
      pid,
      id: "amount",
      action: "set-range",
      value: String(AMOUNT_TYPED)
    });
    await untilStats(report => report["amount"] === AMOUNT_TYPED);
    await shownEquals({
      id: "sum",
      expected: String(COUNT_ASSIGNED + AMOUNT_TYPED)
    });
    assert.equal(
      exists({
        pid,
        id: "enabled-note"
      }), false
    );
    act({
      pid,
      id: "enabled",
      action: "toggle"
    });
    await untilStats(report => report["isEnabled"] === true);
    await appears("enabled-note");
  });

  test("a store drives each", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    example.send({
      cmd: "add",
      item: "alpha"
    });
    example.send({
      cmd: "add",
      item: "beta"
    });
    const report = await untilStats(value => Array.isArray(value["items"]) && value["items"].length === 2);
    assert.deepEqual(report["items"], ["alpha", "beta"]);
  });

  test("a readable ticks while it has a subscriber and stops when the last leaves", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    assert.equal(
      tally({
        report: await stats(),
        key: "clock"
      }), 0
    );
    example.send({
      cmd: "clock",
      show: true
    });
    await appears("clock");
    await untilStats(report => Number(report["clock"]) > 1);
    await until({
      produce: () => Number(shown("clock")),
      isDone: value => value > 1
    });
    assert.equal(
      tally({
        report: await stats(),
        key: "clock"
      }), 1
    );
    example.send({
      cmd: "clock",
      show: false
    });
    await untilStats(report => tally({
      report,
      key: "clock"
    }) === 0);
  });

  test("a store is unsubscribed when its component is destroyed", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const before = Number(
      tally({
        report: await stats(),
        key: "count"
      })
    );
    example.send({
      cmd: "subscriber",
      show: true
    });
    await untilStats(report => tally({
      report,
      key: "count"
    }) === before + 2);
    example.send({
      cmd: "subscriber",
      show: false
    });
    await untilStats(report => tally({
      report,
      key: "count"
    }) === before);
  });

  test("Tween, Spring and the tweened and spring stores end at their target", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    function isAt({ report, target }: {
      report: Report;
      target: number;
    }) {
      return report["tween"] === target && report["spring"] === target && report["tweened"] === target && report["springStore"] === target;
    }

    example.send({
      cmd: "motion",
      target: FULL
    });
    await untilStats(report => isAt({
      report,
      target: FULL
    }));
    assert.equal(
      read({
        pid: example.pid,
        id: "tween"
      }).range, FULL
    );
    example.send({
      cmd: "motion",
      target: 0
    });
    await untilStats(report => isAt({
      report,
      target: 0
    }));
  });

  test("SvelteMap, SvelteSet, SvelteDate, MediaQuery and createSubscriber update the window", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    example.send({ cmd: "reactivity" });
    await shownEquals({
      id: "prices",
      expected: "7"
    });
    await shownEquals({
      id: "tags",
      expected: "2"
    });
    const report = await stats();
    assert.deepEqual(report["tags"], ["a", "b"]);
    assert.equal(report["year"], STAMP_YEAR);
    assert.equal(report["isWide"], true);
    example.send({
      cmd: "external",
      show: true
    });
    await shownEquals({
      id: "external",
      expected: "0"
    });
    assert.equal(
      tally({
        report: await stats(),
        key: "external"
      }), 1
    );
    example.send({ cmd: "bump-external" });
    await shownEquals({
      id: "external",
      expected: "1"
    });
  });
});
