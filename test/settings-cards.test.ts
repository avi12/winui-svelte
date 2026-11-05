import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The settings cards example (examples/settings-cards) in a real WinUI window,
// off screen and never activated: a card with a switch, a clickable card and an
// expander. The cards must have the toolkit's height (68 pixels at least), the
// clickable one must be a button that UI Automation names after its header, and
// the expander's items must take room only once it is open. Skipped where the
// Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const LAYOUT_MILLISECONDS = 1500;
const MINIMUM_CARD_HEIGHT = 68;

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

test("settings cards have the toolkit's size, name themselves for UI Automation and open their items", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/settings-cards/main.ts" });
  async function stats() {
    return await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
  }

  function heightOf({ report, field }: {
    report: Awaited<ReturnType<typeof stats>>;
    field: string;
  }) {
    const measured = report[field];
    const isRecord = typeof measured === "object" && measured !== null && !Array.isArray(measured);
    assert.ok(isRecord, `${field} was measured`);
    return numberOf({
      report: measured,
      field: "height"
    });
  }

  try {
    await wait(LAYOUT_MILLISECONDS);
    const closed = await stats();
    assert.ok(
      heightOf({
        report: closed,
        field: "plain"
      }) >= MINIMUM_CARD_HEIGHT, "a card is at least 68 pixels high"
    );
    assert.ok(
      heightOf({
        report: closed,
        field: "clickable"
      }) >= MINIMUM_CARD_HEIGHT, "a clickable card is at least 68 pixels high"
    );
    assert.equal(closed["clickableName"], "Open the logs", "the clickable card is named after its header");
    assert.equal(closed["clickableHelp"], "Opens the log folder", "and described by its description");
    assert.equal(
      heightOf({
        report: closed,
        field: "inner"
      }), 0, "a closed expander's items take no room"
    );

    await example.ask({
      command: {
        cmd: "expand"
      },
      kind: "expanded"
    });
    await wait(LAYOUT_MILLISECONDS);
    const open = await stats();
    assert.ok(
      heightOf({
        report: open,
        field: "inner"
      }) >= MINIMUM_CARD_HEIGHT, "an open expander shows its items"
    );
  } finally {
    await example.stop();
  }
});
