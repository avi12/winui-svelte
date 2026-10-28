import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The transitions example (examples/transitions) in a real WinUI window, off
// screen and never activated: a card that fades and flies in and out. The card
// must stay in its panel until the outro has run, and move by WinUI's own
// Opacity and Translation meanwhile. Skipped where the Windows App SDK was not
// restored.

const TIMEOUT_MILLISECONDS = 300_000;
// The example's transitions run 600 milliseconds.
const HALF_WAY_MILLISECONDS = 250;
const PAST_THE_END_MILLISECONDS = 1200;

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

test("a card flies in, and leaves its panel only once it has flown out", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/transitions/main.ts" });
  try {
    const before = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    const titleOnly = numberOf({
      report: before,
      field: "children"
    });

    await example.ask({
      command: {
        cmd: "show"
      },
      kind: "shown"
    });
    await wait(PAST_THE_END_MILLISECONDS);
    const shown = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.equal(
      numberOf({
        report: shown,
        field: "children"
      }), titleOnly + 1
    );
    assert.equal(
      numberOf({
        report: shown,
        field: "opacity"
      }), 1, "the intro ended on the card's own opacity"
    );

    await example.ask({
      command: {
        cmd: "hide"
      },
      kind: "hidden"
    });
    await wait(HALF_WAY_MILLISECONDS);
    const leaving = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.equal(
      numberOf({
        report: leaving,
        field: "children"
      }), titleOnly + 1, "still in the panel half way through its outro"
    );
    const opacity = numberOf({
      report: leaving,
      field: "opacity"
    });
    assert.ok(opacity > 0 && opacity < 1, `${opacity} part-way`);

    await wait(PAST_THE_END_MILLISECONDS);
    const gone = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.equal(
      numberOf({
        report: gone,
        field: "children"
      }), titleOnly, "gone once the outro ended"
    );
    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});
