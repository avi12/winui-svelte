import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The typography example (examples/typography) in a real WinUI window, off
// screen: the same text in Calibri laid out plain, in small caps and with
// the features written as tags (Gabriola shows "ss06" and "salt"). WinUI
// draws a TextBlock's Typography properties through DirectWrite, so each
// feature changes the width of the text the way the font defines it; the
// widths read back from the real TextBlocks must differ from the plain one.
// The type ramp's `font: var(--type-title)` gives the TextBlock the size of
// WinUI's Title step, so it is taller than the Body step.
// Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;

function measureOf({ report, field }: {
  report: Parameters<typeof numberOf>[0]["report"];
  field: string;
}) {
  return numberOf({
    report,
    field
  });
}

test("OpenType features of CSS reach the TextBlock's Typography, and the type ramp its font size", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/typography/main.ts" });
  try {
    const report = await example.settled({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.notEqual(
      measureOf({
        report,
        field: "smallCaps"
      }), measureOf({
        report,
        field: "plain"
      }), "font-variant-caps: small-caps changes the width"
    );
    assert.notEqual(
      measureOf({
        report,
        field: "feature"
      }), measureOf({
        report,
        field: "plain"
      }), "font-feature-settings changes the width"
    );
    assert.ok(
      measureOf({
        report,
        field: "title"
      }) > measureOf({
        report,
        field: "body"
      }), "the Title step is taller than the Body step"
    );
  } finally {
    await example.stop();
  }
});
