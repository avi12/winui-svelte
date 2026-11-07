import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import type { Report } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The incremental list example (examples/incremental-list) in a real WinUI
// window, off screen and never activated: a ListView bound to an incremental
// source of 100 items in batches of 20. The window scrolls by
// ScrollViewer.ChangeView (no input is sent) and the test reads the loaded
// count back. Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const WAIT_MILLISECONDS = 15_000;
const POLL_MILLISECONDS = 300;
const BATCH_SIZE = 20;
const TOTAL_ITEMS = 100;
const MAX_SCROLLS = 12;

function loadedOf(report: Report) {
  return numberOf({
    report,
    field: "loaded"
  });
}

// Asks for the stats until one meets `isWanted`.
async function statsWhere({ example, isWanted }: {
  example: ExampleProcess;
  isWanted(report: Report): boolean;
}) {
  const deadline = Date.now() + WAIT_MILLISECONDS;
  while (Date.now() < deadline) {
    const report = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    if (isWanted(report)) {
      return report;
    }

    await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
  }

  throw new Error("the list did not reach the wanted state");
}

test("a list loads its next batch as it scrolls to the end, fails once, retries and ends", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/incremental-list/main.ts" });
  try {
    const opened = await statsWhere({
      example,
      isWanted: report => loadedOf(report) >= BATCH_SIZE && report["status"] === "idle"
    });
    assert.ok(loadedOf(opened) >= BATCH_SIZE);

    await example.ask({
      command: {
        cmd: "scroll-end"
      },
      kind: "scrolled"
    });
    const grown = await statsWhere({
      example,
      isWanted: report => loadedOf(report) > loadedOf(opened)
    });
    assert.ok(loadedOf(grown) > BATCH_SIZE);

    await example.ask({
      command: {
        cmd: "fail-next"
      },
      kind: "armed"
    });
    let failed = await statsWhere({
      example,
      isWanted: () => true
    });
    for (let i = 0; i < MAX_SCROLLS && failed["status"] !== "error"; i++) {
      await example.ask({
        command: {
          cmd: "scroll-end"
        },
        kind: "scrolled"
      });
      failed = await statsWhere({
        example,
        isWanted: report => report["status"] !== "loading"
      });
    }

    assert.equal(failed["error"], "the server is away");
    await example.ask({
      command: {
        cmd: "retry"
      },
      kind: "retried"
    });
    let finished = await statsWhere({
      example,
      isWanted: report => report["status"] !== "loading" && report["status"] !== "error"
    });
    for (let i = 0; i < MAX_SCROLLS && finished["status"] !== "done"; i++) {
      await example.ask({
        command: {
          cmd: "scroll-end"
        },
        kind: "scrolled"
      });
      finished = await statsWhere({
        example,
        isWanted: report => report["status"] !== "loading"
      });
    }

    assert.equal(finished["status"], "done");
    assert.equal(loadedOf(finished), TOTAL_ITEMS);
  } finally {
    await example.stop();
  }
});
