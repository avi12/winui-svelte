import { LanguageServer } from "./language-server.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";

// What the editor shows when the pointer rests on a prop: the Svelte language
// server (the one VS Code runs) is asked for the hover on `glyph` and on the
// tag of test/Documentation.fixture.svelte, and answers with WinUI's own
// documentation of FontIcon.Glyph and FontIcon.

const PACKAGE_FOLDER = path.resolve(import.meta.dirname, "../..");
const FIXTURE = path.join(PACKAGE_FOLDER, "test", "Documentation.fixture.svelte");
const SERVER_TIMEOUT_MILLISECONDS = 300_000;
const GLYPH_SUMMARY = "Gets or sets the character code that identifies the icon glyph.";
const GLYPH_INPUT_SUMMARY = "Accepts an icon glyph: the character, or its code point";
const FONT_ICON_SUMMARY = "Represents an icon that uses a glyph from the specified font.";
const DOCUMENTATION_URL = "https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.fonticon";

const server = new LanguageServer(PACKAGE_FOLDER);

// The position just inside a word of the fixture's markup.
function inside(word: string) {
  const lines = readFileSync(FIXTURE, "utf8").split("\n");
  const line = lines.findIndex(text => text.startsWith("<FontIcon"));
  const character = (lines[line] ?? "").indexOf(word) + 1;
  return {
    file: FIXTURE,
    line,
    character
  };
}

before(async () => {
  await server.start([PACKAGE_FOLDER]);
  server.open(FIXTURE);
  await server.settle([FIXTURE]);
}, { timeout: SERVER_TIMEOUT_MILLISECONDS });

after(() => {
  server.stop();
});

test("a prop shows WinUI's documentation of the property on hover", async () => {
  const hover = await server.hoverAt(inside("glyph"));
  assert.ok(hover.includes(GLYPH_SUMMARY), hover);
  assert.ok(hover.includes(DOCUMENTATION_URL), hover);
});

test("a prop's hover says what its input type accepts, since the type's own comment is not shown", async () => {
  const hover = await server.hoverAt(inside("glyph"));
  assert.ok(hover.includes(GLYPH_INPUT_SUMMARY), hover);
});

test("the component's tag shows WinUI's documentation of the class on hover", async () => {
  const hover = await server.hoverAt(inside("FontIcon"));
  assert.ok(hover.includes(FONT_ICON_SUMMARY), hover);
});
