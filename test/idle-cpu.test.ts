import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, processorMilliseconds } from "./example-process.ts";
import { buildRelay, RelayProcess } from "./relay-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// A window with nothing to do costs next to nothing, and never a full core.
// The UI thread sleeps in the message wait until a message arrives or libuv
// has work (src/window/libuv-wake.ts), the tray icon reads the pointer only
// near the taskbar, and a message from the host still reaches the window at
// once. The windows sit idle on the test's own desktop and the processor time
// of their process is read over many short stretches in every run, because a
// spin shows in some runs only. Two limits, both on all the stretches of all
// the runs: no stretch may come near a spin (the maximum), and the typical one
// must be low (the median; a poll that wakes the thread 30 times a second
// costs about 2% in every stretch, a burst of the system's own costs one).
// Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 590_000;
const SETTLE_MILLISECONDS = 15_000;
const TREE_SETTLE_MILLISECONDS = 25_000;
const STRETCH_MILLISECONDS = 5000;
const STRETCHES = 6;
const RELAY_RUNS = 5;
const PERCENT = 100;
const MAXIMUM_PERCENT_OF_A_CORE = 10;
const MAXIMUM_MEDIAN_PERCENT_OF_A_CORE = 1.5;
const MAXIMUM_ROUND_TRIP_MILLISECONDS = 100;

function pause(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

// The share of one core the process used over the next `milliseconds`.
async function percentOfCoreOver({ pid, milliseconds }: {
  pid: number;
  milliseconds: number;
}) {
  const before = processorMilliseconds(pid);
  const started = performance.now();
  await pause(milliseconds);
  return (processorMilliseconds(pid) - before) / (performance.now() - started) * PERCENT;
}

function medianOf(values: number[]) {
  const sorted = values.toSorted((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function assertIdle({ percents, what }: {
  percents: number[];
  what: string;
}) {
  const maximum = Math.max(...percents);
  const median = medianOf(percents);
  console.log(`${what}: median ${median.toFixed(2)}%, maximum ${maximum.toFixed(2)}% of one core over ${percents.length} stretches`);
  assert.ok(maximum < MAXIMUM_PERCENT_OF_A_CORE, `${what}: a stretch used ${maximum.toFixed(2)}% of a core`);
  assert.ok(median < MAXIMUM_MEDIAN_PERCENT_OF_A_CORE, `${what}: the median stretch used ${median.toFixed(2)}% of a core`);
}

async function stretchesOf(pid: number) {
  const percents: number[] = [];
  for (let iStretch = 0; iStretch < STRETCHES; iStretch += 1) {
    percents.push(
      await percentOfCoreOver({
        pid,
        milliseconds: STRETCH_MILLISECONDS
      })
    );
  }

  return percents;
}

test("a sidecar window with a tray icon, a port, pipes and a watcher is idle in every run", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const built = await buildRelay();
  try {
    const all: number[] = [];
    for (let iRun = 0; iRun < RELAY_RUNS; iRun += 1) {
      const relay = RelayProcess.start(built.outDirectory);
      try {
        await relay.ready;
        await pause(SETTLE_MILLISECONDS);
        const percents = await stretchesOf(relay.pid);
        all.push(...percents);
        console.log(`run ${iRun}: ${percents.map(percent => percent.toFixed(2)).join(", ")}% of one core`);
        relay.closePipes();
        const exit = await relay.waitForExit();
        assert.equal(exit.code, 0, exit.stderr);
      } finally {
        relay.kill();
      }
    }

    assertIdle({
      percents: all,
      what: `${RELAY_RUNS} runs of the relay`
    });
  } finally {
    built.remove();
  }
});

test("an idle window answers the host at once", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/tree/main.ts" });
  try {
    await example.settled({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    await pause(TREE_SETTLE_MILLISECONDS);
    assertIdle({
      percents: await stretchesOf(example.pid),
      what: "the tree example"
    });

    const asked = performance.now();
    await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    const roundTrip = performance.now() - asked;
    assert.ok(roundTrip < MAXIMUM_ROUND_TRIP_MILLISECONDS, `an idle window answered the host after ${roundTrip.toFixed(0)} ms`);
    assert.equal(await example.stop(), true);
  } catch (error) {
    example.kill();
    throw error;
  }
});
