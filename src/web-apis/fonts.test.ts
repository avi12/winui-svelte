import { fontFamilySource, isFontRegistered } from "#src/font-files.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// FontFace and FontFaceSet over the font registry; that WinUI draws with the
// file is test/fonts.test.ts's.

const { FontFace, FontFaceSet, FontLoadStatus, installFontFaces } = await import("./fonts.ts");

const FIXTURE = new URL("../../test/fixtures/winui-test-face.ttf", import.meta.url);
const FAMILY = "Winui Test Face";

function isNetworkError(error: unknown) {
  return error instanceof DOMException && error.name === "NetworkError";
}

test("adding a face registers its file, which a font family then names", () => {
  const fonts = new FontFaceSet();
  const face = new FontFace(FAMILY, `url("${FIXTURE.href}")`);
  assert.equal(face.status, FontLoadStatus.UNLOADED);
  fonts.add(face);
  assert.equal(face.status, FontLoadStatus.LOADED);
  assert.ok(fonts.has(face));
  assert.equal(fonts.size, 1);
  assert.match(fontFamilySource(FAMILY), /^ms-appx:\/\/\/[A-Za-z]:\/.*\/winui-test-face\.ttf#Winui Test Face$/u);
  assert.ok(fonts.check(`16px "${FAMILY}"`));
  assert.ok(fonts.delete(face));
  assert.equal(isFontRegistered(FAMILY), false);
});

test("a face made from bytes is written to a file of its own", async () => {
  const fonts = new FontFaceSet();
  fonts.add(new FontFace(FAMILY, await readFile(FIXTURE)));
  assert.match(fontFamilySource(FAMILY), /winui-svelte-fonts\/[0-9a-f]{40}\.ttf#Winui Test Face$/u);
  fonts.clear();
  assert.equal(isFontRegistered(FAMILY), false);
});

test("a face whose file is missing rejects with NetworkError and is in error", async () => {
  const face = new FontFace("Gone", "url(./no-such-font.ttf)");
  await assert.rejects(face.load(), isNetworkError);
  assert.equal(face.status, FontLoadStatus.ERROR);
  await assert.rejects(face.loaded, isNetworkError);
});

test("load loads the faces a font names", async () => {
  const fonts = new FontFaceSet();
  const face = new FontFace(FAMILY, FIXTURE.href);
  assert.deepEqual(await fonts.load(`bold 12px ${FAMILY}, serif`), []);
  fonts.add(face);
  assert.deepEqual(await fonts.load(`12px "${FAMILY}"`), [face]);
  fonts.clear();
});

test("installing defines FontFace and document.fonts, and uninstalling removes them", () => {
  const uninstall = installFontFaces();
  assert.ok(new globalThis.FontFace(FAMILY, FIXTURE.href) instanceof FontFace);
  assert.ok(document.fonts instanceof FontFaceSet);
  uninstall();
  assert.equal("FontFace" in globalThis, false);
  assert.equal("document" in globalThis, false);
});
