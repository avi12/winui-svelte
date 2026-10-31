import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The page API over a real window, off screen on a desktop of its own and
// never activated: the document's visibility follows a minimize and a restore,
// the title and the fullscreen and compact overlay presenters are read back
// from the window. No input is sent. Skipped where the Windows App SDK was not
// restored.

const TIMEOUT_MILLISECONDS = 300_000;
const SETTLE_MILLISECONDS = 600;

function seenOf(report: Record<string, unknown>) {
  const seen = report["seen"];
  return Array.isArray(seen) ? seen.map(String) : [];
}

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

test("the page follows a real window through minimize, fullscreen and the compact overlay", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "test/page-window.ts" });
  try {
    async function ask(cmd: string) {
      const isRead = cmd === "page";
      if (!isRead) {
        example.send({ cmd });
        await wait(SETTLE_MILLISECONDS);
      }

      return example.ask({
        command: {
          cmd: "page"
        },
        kind: "page"
      });
    }

    const opened = await ask("page");
    assert.equal(opened["title"], "Page example");
    assert.equal(opened["windowState"], "normal");
    assert.equal(opened["visibilityState"], "visible");

    const minimized = await ask("minimize");
    assert.equal(minimized["visibilityState"], "hidden", "a minimized window is hidden");
    assert.equal(minimized["windowState"], "minimized");
    const restored = await ask("restore");
    assert.equal(restored["visibilityState"], "visible");
    assert.deepEqual(
      seenOf(restored).filter(type => type === "visibilitychange"),
      ["visibilitychange", "visibilitychange"]
    );

    const retitled = await ask("retitle");
    assert.equal(retitled["title"], "Renamed");

    const fullscreen = await ask("fullscreen");
    assert.equal(fullscreen["windowState"], "fullscreen");
    const left = await ask("leave-fullscreen");
    assert.equal(left["windowState"], "normal");
    assert.ok(seenOf(left).includes("fullscreenchange"));

    const compact = await ask("compact");
    assert.equal(compact["windowState"], "compact-overlay");
    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0, "closing the window ends the example");
  } finally {
    example.kill();
  }
});
