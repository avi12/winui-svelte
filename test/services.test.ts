import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The app services example (examples/services) in a real WinUI window, off
// screen and never activated: the accent color the window shows is the
// system's, the page reports its own size and theme, and the handle has the
// file dialogs. The dialogs themselves are modal and need a person, so they
// are not opened here. Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const ELEMENT_THEME_LIGHT = 1;
const ELEMENT_THEME_DARK = 2;
const HEX_COLOR = /^#[0-9a-f]{6}$/u;

test("the window follows the system settings and reports its size and theme", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/services/main.ts" });
  try {
    const stats = await example.settled({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.match(String(stats["accent"]), HEX_COLOR, "the accent is text a color prop takes");
    assert.equal(stats["swatch"], stats["accent"], "the brush WinUI holds is the system accent");
    assert.ok(
      numberOf({
        report: stats,
        field: "textScaleFactor"
      }) >= 1, "the text scale is 100% or more"
    );
    assert.equal(typeof stats["isAnimationEnabled"], "boolean");
    assert.equal(typeof stats["isHighContrast"], "boolean");
    assert.ok(
      numberOf({
        report: stats,
        field: "width"
      }) > 0, "the page was laid out and its width read"
    );
    assert.ok(
      numberOf({
        report: stats,
        field: "height"
      }) > 0, "the page was laid out and its height read"
    );
    assert.ok(
      [ELEMENT_THEME_LIGHT, ELEMENT_THEME_DARK].includes(
        numberOf({
          report: stats,
          field: "theme"
        })
      ), "the page is drawn in light or dark"
    );
    assert.match(String(stats["language"]), /^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/u);
    assert.equal(stats["canPick"], true, "the handle has pickFile, pickFiles, pickFolder and saveFile");

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});
