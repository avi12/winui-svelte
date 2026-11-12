import { registerControls } from "#src/renderer/host/host.js";
import { FakeBorder, FakeButton, fakeControls, FakePanel } from "#src/renderer/testing/fake-controls.js";
import { svelteHooks } from "#src/vite/loader.js";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import type { Snippet } from "svelte";

// A row whose root control changes (a hot update of a row component, an {#if}
// in the snippet) reaches the container's slot: the slot's content is the new
// root, not the control the container's presenter held.

registerControls(fakeControls);
registerHooks(svelteHooks());
const { mountSnippetRow } = await import("./keyed-rows.svelte.ts");
// The typings of a .svelte module name only its default export.
const { rowOf } = await import("./RootSwap.fixture.svelte") as unknown as { rowOf: Snippet<[boolean]> };

// Svelte applies a change on the next microtask.
function settled() {
  return new Promise(resolve => setTimeout(resolve));
}

test("a realized row puts its new root in the container's slot", async () => {
  const slot = new FakeButton();
  const row = mountSnippetRow({
    // The fake stands for the ContentControl the container made.
    slot: slot as never,
    snippet: rowOf,
    value: false
  });
  assert.ok(slot.content instanceof FakePanel);

  row.update(true);
  await settled();
  assert.ok(slot.content instanceof FakeBorder);

  row.update(false);
  await settled();
  assert.ok(slot.content instanceof FakePanel);
  row.unmount();
  assert.equal(slot.content, null);
});
