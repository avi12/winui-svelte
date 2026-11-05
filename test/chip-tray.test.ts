import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

// The chip tray example (examples/chip-tray) in a real WinUI window, off screen
// and never activated, 300 wide: a RichTextBlock holding each chip in an
// InlineUIContainer wraps chips of different widths onto further lines, and
// VariableSizedWrapGrid wraps too but gives every chip the same cell. Skipped
// where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const LAYOUT_MILLISECONDS = 1500;
const WINDOW_WIDTH = 300;

const placesSchema = z.array(z.tuple([z.number(), z.number(), z.number()]));
const statsSchema = z.object({
  gridChips: placesSchema,
  textChips: placesSchema
});

test("inline chips wrap by their own widths; the wrap grid wraps by one cell", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/chip-tray/main.ts" });
  try {
    await new Promise(resolve => setTimeout(resolve, LAYOUT_MILLISECONDS));
    const report = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    const { gridChips, textChips } = statsSchema.parse(report);

    const lines = new Set(textChips.map(([, y]) => y));
    assert.ok(lines.size >= 3, `the chips wrapped onto ${lines.size} lines`);
    const widths = new Set(textChips.map(([, , width]) => width));
    assert.ok(widths.size > 3, "the chips kept their own widths");
    for (const [left, , width] of textChips) {
      assert.ok(left + width <= WINDOW_WIDTH, "no chip runs past the right edge");
    }
    const tops = textChips.map(([, y]) => y);
    assert.deepEqual(tops, [...tops].sort((first, second) => first - second), "the chips stay in order");

    assert.ok(new Set(gridChips.map(([, y]) => y)).size >= 2, "the grid wrapped too");
    assert.equal(new Set(gridChips.map(([, , width]) => width)).size, 1, "every grid chip got one cell width");
  } finally {
    await example.stop();
  }
});
