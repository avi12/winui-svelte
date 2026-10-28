import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The items example (examples/items) in a real WinUI window, off screen and
// never activated: each control that keeps its items in an ItemsRepeater
// shows them as Svelte components, makes a row for what it shows, and ends
// the row of an item that goes. Skipped where the Windows App SDK was not
// restored.

const TIMEOUT_MILLISECONDS = 300_000;
const ROW_COUNT = 20;

const views = ["repeater", "itemsView", "breadcrumb"];

for (const view of views) {
  test(`${view} shows its items as rows, follows them and ends the rows of the items that go`, {
    skip: !IS_WINDOWS_APP_SDK_RESTORED,
    timeout: TIMEOUT_MILLISECONDS
  }, async () => {
    const example = ExampleProcess.start({
      entry: "examples/items/main.ts",
      flags: ["--view", view, "--rows", String(ROW_COUNT)]
    });
    try {
      const opened = await example.settled({
        command: {
          cmd: "stats"
        },
        kind: "stats"
      });
      const shown = numberOf({
        report: opened,
        field: "live"
      });
      assert.ok(shown > 0 && shown <= ROW_COUNT, `${shown} rows shown of ${ROW_COUNT}`);
      // A rename reaches the row that shows it without making a new one.
      const renamed = await example.settled({
        command: {
          cmd: "rename",
          key: "row-0",
          name: "Renamed"
        },
        kind: "renamed"
      });
      assert.equal(
        numberOf({
          report: renamed,
          field: "created"
        }), numberOf({
          report: opened,
          field: "created"
        })
      );

      const removed = await example.settled({
        command: {
          cmd: "remove",
          key: "row-0"
        },
        kind: "removed"
      });
      assert.ok(
        numberOf({
          report: removed,
          field: "live"
        }) < shown, "the removed item kept its row"
      );

      const cleared = await example.settled({
        command: {
          cmd: "clear"
        },
        kind: "cleared"
      });
      assert.equal(
        numberOf({
          report: cleared,
          field: "live"
        }), 0, "rows outlived their items"
      );

      example.send({ cmd: "close" });
      assert.equal(await example.exited, 0);
    } finally {
      example.kill();
    }
  });
}
