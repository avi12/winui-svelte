import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const TIMEOUT_MILLISECONDS = 300_000;

// A ComboBox's items are put back in order by the renderer, and the control
// raises SelectionChanged for it: that is no pick by the user, and the
// selection stays on the item the app assigned. (Taken for a pick, it wrote
// the app's state inside the renderer's own update, which threw there and left
// the renderer's list of items out of step with the control's.)
test("a ComboBox keeps its selection when the items under it are reordered", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/theme-picker/main.ts" });
  try {
    const swapped = await example.settled({
      command: {
        cmd: "swap",
        from: 2,
        to: 0
      },
      kind: "swapped"
    });
    assert.equal(swapped["order"], "gamma,alpha,beta,delta");
    const after = await example.settled({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.equal(after["order"], "gamma,alpha,beta,delta");
    assert.equal(
      numberOf({
        report: after,
        field: "selectedIndex"
      }), 0
    );
    assert.equal(
      numberOf({
        report: after,
        field: "changes"
      }), 0, "the items moving was taken for the user picking"
    );
    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});
