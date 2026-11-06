import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The visual-states example (examples/visual-states) in a real WinUI window,
// off screen: a button and a card whose :hover, :active and :disabled rules set
// colors. The test never moves the pointer: the example enters each state of
// the template with VisualStateManager.GoToState and reads back the brush of
// the template's ContentPresenter, which must be the color the rule wrote.
// Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const EXPECTED = new Map([
  ["ctaNormal", "#0a6cff"],
  ["ctaPointerOver", "#0050c8"],
  ["ctaPressed", "#003a8f"],
  ["ctaDisabled", "#888888"],
  ["cardNormal", "#ffffff"],
  ["cardPointerOver", "#eef4ff"],
  ["cardPressed", "#dbe7ff"],
  ["cardDisabled", "#eeeeee"]
]);

test("a state rule's colors are what the template draws in that visual state", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/visual-states/main.ts" });
  try {
    const report = await example.settled({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    for (const [field, color] of EXPECTED) {
      assert.equal(report[field], color, field);
    }
    const themed = String(report["cardPressedBorder"]);
    assert.match(themed, /^#[0-9a-f]{6}$/u, "a var() of a theme brush resolves to a color");
  } finally {
    await example.stop();
  }
});
