import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The fonts example (examples/fonts) in a real WinUI window, off screen: a font
// file of the app, test/fixtures/winui-test-face.ttf, is used by its family
// name. Every glyph of the file is one em wide, so "Hello Face" (ten
// characters) is ten font sizes wide when the text is laid out with the file,
// and something else in any other font. Once through `@font-face` in a
// `<style>`, once through `FontFace` and `document.fonts.add`.
// Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const FONT_SIZE = 20;
const CHARACTERS = 10;
const EXPECTED_WIDTH = FONT_SIZE * CHARACTERS;
const EPSILON = 0.5;
const FIXTURE = path.join(import.meta.dirname, "fixtures", "winui-test-face.ttf");

// The font file of the FontFace view sits in a folder whose name has a space
// and a non-ASCII letter, as an app's folder may.
function copiedFixture() {
  const folder = path.join(mkdtempSync(path.join(tmpdir(), "winui fonts é-")), "fonts");
  mkdirSync(folder);
  const copy = path.join(folder, path.basename(FIXTURE));
  copyFileSync(FIXTURE, copy);
  return copy;
}

async function widthsOf(flags: string[]) {
  const example = ExampleProcess.start({
    entry: "examples/fonts/main.ts",
    flags
  });
  try {
    const report = await example.settled({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    return {
      custom: numberOf({
        report,
        field: "custom"
      }),
      fallback: numberOf({
        report,
        field: "fallback"
      })
    };
  } finally {
    await example.stop();
  }
}

function assertUsesTheFile({ custom, fallback }: {
  custom: number;
  fallback: number;
}) {
  assert.ok(Math.abs(custom - EXPECTED_WIDTH) < EPSILON, `laid out with the file: ${custom} is ${EXPECTED_WIDTH}`);
  assert.ok(Math.abs(fallback - EXPECTED_WIDTH) > EPSILON, `the default font is not the file's width: ${fallback}`);
}

test("a font file named by a style sheet's @font-face is used by its family name", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  assertUsesTheFile(await widthsOf(["--view", "style"]));
});

test("a font file added with FontFace and document.fonts.add is used by its family name", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  assertUsesTheFile(await widthsOf(["--view", "face", "--file", copiedFixture()]));
});
