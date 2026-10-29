import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import type { Report } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// Each app of examples/ in a real WinUI window, off screen and never
// activated: it opens, shows its key control and closes with exit code 0.
// Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const BACKGROUND_FLAGS = ["--background", "yes"];

function presentIn(report: Report) {
  const present = report["present"];
  return Array.isArray(present) ? present : [];
}

async function closed(example: ExampleProcess) {
  example.send({ cmd: "close" });
  assert.equal(await example.exited, 0);
}

test("the gallery shows each of its pages", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({
    entry: "examples/gallery/main.ts",
    flags: BACKGROUND_FLAGS
  });
  try {
    const pages = await example.ask({
      command: {
        cmd: "pages"
      },
      kind: "pages"
    });
    const keys = Array.isArray(pages["keys"]) ? pages["keys"] : [];
    assert.ok(keys.length > 0);
    for (const key of keys) {
      const shown = await example.settled({
        command: {
          cmd: "navigate",
          to: String(key)
        },
        kind: "navigated"
      });
      assert.ok(presentIn(shown).includes(key), `the ${String(key)} page shows its key control`);
    }

    await closed(example);
  } finally {
    example.kill();
  }
});
