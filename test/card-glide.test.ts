import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The card glide example (examples/card-glide) in a real WinUI window, off
// screen and never activated: a card whose text grows and shrinks. glideHeight
// must move the card's height through sizes between the two while the glide
// runs, and give the height back to the content when it ends. Skipped where the
// Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const LAYOUT_MILLISECONDS = 1500;
// The example's glide runs 600 milliseconds.
const PARTWAY_MILLISECONDS = 250;
const PAST_THE_END_MILLISECONDS = 1500;

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

test("a card glides between the heights its text asks for", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/card-glide/main.ts" });
  async function sample() {
    const report = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    return {
      height: numberOf({
        report,
        field: "height"
      }),
      isFixed: report["isHeightFixed"] === true
    };
  }

  try {
    await wait(LAYOUT_MILLISECONDS);
    const short = await sample();
    assert.ok(short.height > 0, "the card was laid out");
    assert.equal(short.isFixed, false);

    await example.ask({
      command: {
        cmd: "grow"
      },
      kind: "grown"
    });
    await wait(PARTWAY_MILLISECONDS);
    const partway = await sample();
    await wait(PAST_THE_END_MILLISECONDS);
    const tall = await sample();
    assert.ok(tall.height > short.height, "the long text made the card taller");
    assert.equal(tall.isFixed, false, "the height went back to the content");
    assert.ok(
      partway.height > short.height && partway.height < tall.height,
      `partway through the glide the height (${partway.height}) is between ${short.height} and ${tall.height}`
    );

    await example.ask({
      command: {
        cmd: "shrink"
      },
      kind: "shrunk"
    });
    await wait(PARTWAY_MILLISECONDS);
    const shrinking = await sample();
    await wait(PAST_THE_END_MILLISECONDS);
    const again = await sample();
    assert.equal(again.height, short.height, "the card came back to its first height");
    assert.ok(
      shrinking.height < tall.height && shrinking.height > short.height,
      `partway through the shrink the height (${shrinking.height}) is between ${short.height} and ${tall.height}`
    );
  } finally {
    await example.stop();
  }
});
