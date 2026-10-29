import { registerControls } from "./host.ts";
import { fakeControls, FakePanel } from "#src/renderer/testing/fake-controls.js";
import { svelteHooks } from "#src/vite/loader.js";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// Showing and hiding a block many times leaves nothing behind: the control
// tree returns to its size.

registerControls(fakeControls);
registerHooks(svelteHooks());
const { mountControl } = await import("./mount.svelte.ts");
const { default: Labeled } = await import("#src/renderer/testing/Labeled.fixture.svelte");

const CYCLES = 200;

interface Props {
  isLabelShown: boolean;
}

test("toggling a block many times does not grow the control tree", () => {
  const mounted = mountControl<Props>({
    component: Labeled,
    props: {
      isLabelShown: true
    }
  });
  const root: object = mounted.root;
  assert.ok(root instanceof FakePanel);
  const sizeShown = root.children.items.length;
  for (let i = 0; i < CYCLES; i++) {
    mounted.set({ isLabelShown: false });
    mounted.set({ isLabelShown: true });
  }

  assert.equal(root.children.items.length, sizeShown);
  mounted.unmount();
});
