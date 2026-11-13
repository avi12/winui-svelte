import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("the overlay forwards the image's opened and failed events", () => {
  const source = readFileSync(path.join(import.meta.dirname, "SelectionOverlay.svelte"), "utf8");
  assert.match(source, /onimageopened=\{\(\) => props\.onimageopened\?\.\(\)\}/u);
  assert.match(source, /props\.onimagefailed\?\.\(args\.errorMessage\)/u);
});
