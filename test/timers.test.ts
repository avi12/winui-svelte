import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

// The timers example (examples/timers) in a real WinUI window, off screen and
// never activated: the standard timers and fetch run on the UI thread. A
// setInterval drives a TextBlock, an awaited setTimeout resolves, and a fetch
// of a server of this test settles.
// Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const WAIT_MILLISECONDS = 120;
const SLACK_MILLISECONDS = 400;
const MINIMUM_TICKS = 3;
const SETTLE_MILLISECONDS = 600;
const BODY = "served to the UI thread";

function pause(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

test("setInterval, setTimeout and fetch run on the UI thread", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end(BODY);
  });
  await new Promise<void>(resolve => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address === "object", "the server listens on a port");
  const { port } = address;
  const example = ExampleProcess.start({ entry: "examples/timers/main.ts" });
  try {
    const first = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    await pause(SETTLE_MILLISECONDS);
    const later = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    const ticks = numberOf({
      report: later,
      field: "ticks"
    });
    assert.ok(
      ticks - numberOf({
        report: first,
        field: "ticks"
      }) >= MINIMUM_TICKS, `the interval ticked ${ticks - numberOf({
        report: first,
        field: "ticks"
      })} times in ${SETTLE_MILLISECONDS} ms`
    );
    assert.equal(later["clockText"], String(ticks), "the control shows the count the interval made");

    const waited = await example.ask({
      command: {
        cmd: "wait",
        milliseconds: WAIT_MILLISECONDS
      },
      kind: "waited"
    });
    const elapsed = numberOf({
      report: waited,
      field: "elapsed"
    });
    assert.ok(elapsed >= WAIT_MILLISECONDS - 1 && elapsed < WAIT_MILLISECONDS + SLACK_MILLISECONDS, `awaited setTimeout(${WAIT_MILLISECONDS}) took ${elapsed} ms`);

    const fetched = await example.ask({
      command: {
        cmd: "fetch",
        url: `http://127.0.0.1:${port}/`
      },
      kind: "fetched"
    });
    assert.equal(fetched["status"], 200);
    assert.equal(fetched["body"], BODY);

    await pause(SETTLE_MILLISECONDS);
    const shown = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.equal(shown["messageText"], BODY, "the fetched text is on the control");

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0, "pending timers do not keep the process alive");
  } catch (error) {
    example.kill();
    throw error;
  } finally {
    server.close();
  }
});
