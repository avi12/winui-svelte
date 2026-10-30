import { provenPeerRange } from "./matrix.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("the peer range of svelte is the range the matrix proves", () => {
  const manifest: unknown = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "..", "package.json"), "utf8"));
  assert.ok(typeof manifest === "object" && manifest !== null && "peerDependencies" in manifest);
  assert.ok(typeof manifest.peerDependencies === "object" && manifest.peerDependencies !== null && "svelte" in manifest.peerDependencies);
  assert.equal(manifest.peerDependencies.svelte, provenPeerRange());
});
