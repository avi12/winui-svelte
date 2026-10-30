import { LanguageServer } from "./language-server.ts";
import { AppBarClosedDisplayMode, Backdrop, ColorKeyword, ThemeBrush } from "#src/enums.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";

// What the editor offers at a prop's value: the Svelte language server (the
// one VS Code runs) is asked for completions inside the quotes of each prop of
// test/Choices.fixture.svelte, and offers exactly the set the prop takes.

const PACKAGE_FOLDER = path.resolve(import.meta.dirname, "../..");
const FIXTURE = path.join(PACKAGE_FOLDER, "test", "Choices.fixture.svelte");
const SERVER_TIMEOUT_MILLISECONDS = 300_000;
// The brush test/choice-props.types.ts names in AppBrushes; an augmentation
// holds for the whole project.
const APP_BRUSH = "BrandBrush";

const server = new LanguageServer(PACKAGE_FOLDER);

// The position just inside the quotes of a prop's value.
function valueOf(prop: string) {
  const lines = readFileSync(FIXTURE, "utf8").split("\n");
  const opening = `${prop}="`;
  const line = lines.findIndex(text => text.includes(opening));
  const character = (lines[line] ?? "").indexOf(opening) + opening.length;
  return {
    file: FIXTURE,
    line,
    character
  };
}

async function offeredAt(prop: string) {
  return new Set(await server.completionsAt(valueOf(prop)));
}

before(async () => {
  await server.start([PACKAGE_FOLDER]);
  server.open(FIXTURE);
  await server.settle([FIXTURE]);
}, { timeout: SERVER_TIMEOUT_MILLISECONDS });

after(() => {
  server.stop();
});

test("a WinUI enum prop offers its members' names", async () => {
  assert.deepEqual(await offeredAt("closedDisplayMode"), new Set(Object.keys(AppBarClosedDisplayMode)));
});

test("the window's backdrop offers the Backdrop set", async () => {
  assert.deepEqual(await offeredAt("backdrop"), new Set(Object.values(Backdrop)));
});

test("a brush prop offers the color keywords, WinUI's theme brushes and the app's own", async () => {
  const brushes: string[] = [...Object.values(ColorKeyword), ...Object.values(ThemeBrush), APP_BRUSH];
  assert.deepEqual(await offeredAt("background"), new Set(brushes));
});
