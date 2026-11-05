import { fontFamilySource, isFontRegistered, registerFont, unregisterFont } from "./font-files.ts";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const FOLDER = mkdtempSync(path.join(tmpdir(), "font files-"));
mkdirSync(path.join(FOLDER, "fonts"));
const FILE = path.join(FOLDER, "fonts", "Face.ttf");
writeFileSync(FILE, "");
const BASE = pathToFileURL(path.join(FOLDER, "sheet.js")).href;

test("a registered family is spelled as the app URI of its file and its name; the rest is untouched", () => {
  registerFont({
    family: "Face Sans",
    source: FILE
  });
  const uri = `ms-appx:///${FILE.replaceAll("\\", "/")}`;
  assert.equal(fontFamilySource("Segoe UI"), "Segoe UI");
  assert.equal(fontFamilySource("face sans, Segoe UI"), `${uri}#face sans, Segoe UI`);
  assert.equal(fontFamilySource("Segoe UI,Face Sans"), `Segoe UI, ${uri}#Face Sans`);
  assert.equal(isFontRegistered("FACE SANS"), true);
  assert.equal(unregisterFont("Face Sans"), true);
  assert.equal(fontFamilySource("Face Sans"), "Face Sans");
});

test("a path with a hash or a percent sign is escaped in the app URI", () => {
  const odd = path.join(FOLDER, "fonts", "a#b%c.ttf");
  writeFileSync(odd, "");
  registerFont({
    family: "Odd",
    source: odd
  });
  assert.ok(fontFamilySource("Odd").endsWith("/fonts/a%23b%25c.ttf#Odd"));
  unregisterFont("Odd");
});

test("a file is found as an absolute path, a file URL, or relative to the base", () => {
  const fromUrl = registerFont({
    family: "A",
    source: pathToFileURL(FILE).href
  });
  const fromBase = registerFont({
    family: "B",
    source: "./fonts/Face.ttf",
    base: BASE
  });
  assert.equal(fromUrl, FILE);
  assert.equal(fromBase, FILE);
  unregisterFont("A");
  unregisterFont("B");
});

test("a font next to the bundle is found by its name when the stylesheet's folder is gone", () => {
  const found = registerFont({
    family: "C",
    source: "./elsewhere/fonts/Face.ttf",
    base: pathToFileURL(path.join(FOLDER, "fonts", "bundle.js")).href
  });
  assert.equal(found, FILE);
  unregisterFont("C");
});

test("a missing file is an error that names the places looked", () => {
  assert.throws(() => registerFont({
    family: "Gone",
    source: "./nowhere.ttf",
    base: BASE
  }), /font file for "Gone" not found at .*nowhere\.ttf/u);
  assert.equal(isFontRegistered("Gone"), false);
});
