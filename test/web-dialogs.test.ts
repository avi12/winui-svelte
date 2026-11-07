import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import type { Report } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The dialogs example (examples/web-dialogs) in a real WinUI window, off
// screen and never activated, driven by commands (no input is sent). A
// ContentDialog is closed through its API (Hide, which the abort signal of
// showDialog calls), so a dialog that ends with the result none was open: a
// Hide before the dialog opened would be lost, and one asked while another is
// open would throw (WinUI shows one per window) if the queue did not hold it.

const TIMEOUT_MILLISECONDS = 300_000;
const OPENING_MILLISECONDS = 1500;
const QUIET_MILLISECONDS = 2500;
const READY_ATTEMPTS = 100;
const POLL_MILLISECONDS = 200;

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function settledOf(id: number) {
  return (report: Report) => report["id"] === id;
}

test("dialogs open one at a time in the window, close through their API, and a waiting one can be aborted", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/web-dialogs/main.ts" });
  try {
    let isReady = false;
    for (let iAttempt = 0; iAttempt < READY_ATTEMPTS && !isReady; iAttempt++) {
      const pong = await example.ask({
        command: {
          cmd: "ping"
        },
        kind: "pong"
      });
      isReady = pong["isReady"] === true;
      await wait(POLL_MILLISECONDS);
    }

    assert.ok(isReady, "the window gave its handle to the dialogs");

    example.send({
      cmd: "show",
      id: 1,
      isInput: true
    });
    example.send({
      cmd: "show",
      id: 2
    });
    await wait(OPENING_MILLISECONDS);
    await assert.rejects(
      example.ask({
        command: {
          cmd: "ping"
        },
        kind: "settled",
        timeoutMilliseconds: QUIET_MILLISECONDS
      }),
      /no "settled" report/,
      "two dialogs asked for at once: neither failed and neither closed on its own"
    );

    const first = await example.ask({
      command: {
        cmd: "abort",
        id: 1
      },
      kind: "settled",
      isWanted: settledOf(1)
    });
    assert.equal(first["result"], "none", "the first dialog was open and closed through Hide");

    await wait(OPENING_MILLISECONDS);
    const second = await example.ask({
      command: {
        cmd: "abort",
        id: 2
      },
      kind: "settled",
      isWanted: settledOf(2)
    });
    assert.equal(second["result"], "none", "the second dialog took its turn and closed through Hide");

    example.send({
      cmd: "show",
      id: 3
    });
    example.send({
      cmd: "show",
      id: 4
    });
    await wait(OPENING_MILLISECONDS);
    const waiting = await example.ask({
      command: {
        cmd: "abort",
        id: 4
      },
      kind: "settled",
      isWanted: settledOf(4)
    });
    assert.equal(waiting["error"], "AbortError", "a dialog still waiting is rejected");
    const shown = await example.ask({
      command: {
        cmd: "abort",
        id: 3
      },
      kind: "settled",
      isWanted: settledOf(3)
    });
    assert.equal(shown["result"], "none");
  } finally {
    await example.stop();
  }
});
