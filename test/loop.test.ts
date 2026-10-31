import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The loop example (examples/loop) in a real WinUI window, off screen and
// never activated: every kind of background work Node has completes on the UI
// thread, whose libuv loop turns between WinUI's messages (src/window/
// message-pump.ts), and the control shows what each one brought while an
// interval keeps animating. Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const SETTLE_MILLISECONDS = 400;
// A child process is started on the thread itself, which takes about 120 ms.
const LONGEST_GAP_MILLISECONDS = 250;
const TIMER_DELAY_MILLISECONDS = 1;
const MAXIMUM_MEAN_LATE_MILLISECONDS = 8;
const FRAME_MILLISECONDS = 16;
const MINIMUM_CHUNKS = 2;

const expectations: Array<{
  name: string;
  expected: string | RegExp;
}> = [
  {
    name: "fsPromises",
    expected: "read from a file"
  },
  {
    name: "fsCallback",
    expected: "read from a file"
  },
  {
    name: "fsWatch",
    expected: /^changed /u
  },
  {
    name: "http",
    expected: "one two three"
  },
  {
    name: "fetch",
    expected: /^\d+ chunks: one two three$/u
  },
  {
    name: "net",
    expected: "PING"
  },
  {
    name: "webSocket",
    expected: "echo:hello"
  },
  {
    name: "channel",
    expected: "through a channel"
  },
  {
    name: "worker",
    expected: "from a worker"
  },
  {
    name: "childProcess",
    expected: "hi"
  }
];

function pause(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

test("files, sockets, http, WebSocket, ports, workers and processes complete on the UI thread", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/loop/main.ts" });
  try {
    for (const { name, expected } of expectations) {
      const done = await example.ask({
        command: {
          cmd: "run",
          name
        },
        kind: "done"
      });
      const value = String(done["value"]);
      const isMatch = typeof expected === "string" ? value === expected : expected.test(value);
      assert.ok(isMatch, `${name} settled with "${value}"`);
      const longestGap = numberOf({
        report: done,
        field: "longestGap"
      });
      assert.ok(longestGap < LONGEST_GAP_MILLISECONDS, `${name} left the interval ${longestGap.toFixed(0)} ms without a tick`);
      await pause(SETTLE_MILLISECONDS);
      const shown = await example.ask({
        command: {
          cmd: "stats"
        },
        kind: "stats"
      });
      assert.equal(shown["messageText"], value, `${name}: the control shows what the callback brought`);
    }

    const streamed = await example.ask({
      command: {
        cmd: "run",
        name: "fetch"
      },
      kind: "done"
    });
    assert.ok(Number.parseInt(String(streamed["value"]), 10) >= MINIMUM_CHUNKS, "the response body streams in chunks");

    const timers = await example.ask({
      command: {
        cmd: "timers",
        delay: TIMER_DELAY_MILLISECONDS
      },
      kind: "timers"
    });
    const meanLate = numberOf({
      report: timers,
      field: "meanLate"
    });
    assert.ok(meanLate < MAXIMUM_MEAN_LATE_MILLISECONDS, `setTimeout(${TIMER_DELAY_MILLISECONDS}) was ${meanLate.toFixed(1)} ms late on average (15 ms without 1 ms ticks)`);

    const first = numberOf({
      report: await example.ask({
        command: {
          cmd: "stats"
        },
        kind: "stats"
      }),
      field: "ticks"
    });
    await pause(SETTLE_MILLISECONDS);
    const later = numberOf({
      report: await example.ask({
        command: {
          cmd: "stats"
        },
        kind: "stats"
      }),
      field: "ticks"
    });
    const expectedTicks = SETTLE_MILLISECONDS / FRAME_MILLISECONDS;
    assert.ok(later - first >= expectedTicks / 4, `the animation ticked ${later - first} times in ${SETTLE_MILLISECONDS} ms`);

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0, "pending sockets and timers do not keep the process alive");
  } catch (error) {
    example.kill();
    throw error;
  }
});
