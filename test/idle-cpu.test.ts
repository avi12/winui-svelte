import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// A window with nothing to do costs next to nothing: the UI thread sleeps in
// the message wait until a message arrives or libuv has work (src/window/
// libuv-wake.ts) instead of waking on a short interval, and a message from the
// host still reaches it at once. The tree example sits idle on the test's own
// desktop and the processor time of its process is read over a stretch.
// Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const STRETCHES = 3;
const MEASURE_MILLISECONDS = 10_000;
const PERCENT = 100;
const MAXIMUM_PERCENT_OF_A_CORE = 1;
const MAXIMUM_ROUND_TRIP_MILLISECONDS = 100;

function pause(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

// The share of one core the process used over the next `milliseconds`.
async function percentOfCoreOver({ example, milliseconds }: {
  example: ExampleProcess;
  milliseconds: number;
}) {
  const before = example.cpuMilliseconds();
  await pause(milliseconds);
  return (example.cpuMilliseconds() - before) / milliseconds * PERCENT;
}

// A one-off burst (a garbage collection, a late layout) lands in one stretch;
// polling costs every stretch. So the window is idle if any stretch is quiet.
async function quietestPercent(example: ExampleProcess) {
  const percents: number[] = [];
  for (let iStretch = 0; iStretch < STRETCHES; iStretch += 1) {
    const percent = await percentOfCoreOver({
      example,
      milliseconds: MEASURE_MILLISECONDS
    });
    percents.push(percent);
    const isQuiet = percent < MAXIMUM_PERCENT_OF_A_CORE;
    if (isQuiet) {
      break;
    }
  }

  return Math.min(...percents);
}

test("an idle window uses under 1% of a core and still answers at once", {
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
    const percent = await quietestPercent(example);
    console.log(`idle, quietest ${MEASURE_MILLISECONDS} ms stretch: ${percent.toFixed(2)}% of one core`);
    assert.ok(percent < MAXIMUM_PERCENT_OF_A_CORE, `an idle window used ${percent.toFixed(2)}% of a core`);

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
