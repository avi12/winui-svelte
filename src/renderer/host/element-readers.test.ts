import { registerControls } from "./host.ts";
import { fakeControls, FakeElement, FakePanel } from "#src/renderer/testing/fake-controls.js";
import { svelteHooks } from "#src/vite/loader.js";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// elementSize and elementTheme through a component: the attachments reach the
// element's control, the runes follow its events, and let go with the element.

const LIGHT = 1;
const DARK = 2;
const WIDE = {
  width: 640,
  height: 480
} as const;
const NARROW = {
  width: 320,
  height: 480
} as const;

registerControls(fakeControls);
registerHooks(svelteHooks());
const { mountControl } = await import("./mount.svelte.ts");
const { default: Adaptive } = await import("#src/renderer/testing/Adaptive.fixture.svelte");

interface Props {
  isShown: boolean;
  report: (line: string) => void;
}

function elementOf(root: object) {
  assert.ok(root instanceof FakePanel);
  const [element] = root.children.items;
  assert.ok(element instanceof FakeElement);
  return element;
}

test("size and theme follow the element, and let go when it goes", () => {
  const lines: string[] = [];
  const mounted = mountControl<Props>({
    component: Adaptive,
    props: {
      isShown: true,
      report: line => lines.push(line)
    }
  });
  const element = elementOf(mounted.root);
  assert.deepEqual(lines, ["size 0x0", `theme ${LIGHT}`], "the element's own size and theme are read when it is attached");
  assert.equal(element.listenerCount, 2);

  lines.length = 0;
  element.resize(WIDE);
  mounted.set({});
  assert.deepEqual(lines, ["size 640x480"]);

  lines.length = 0;
  element.resize(NARROW);
  element.retheme(DARK);
  mounted.set({});
  assert.deepEqual(lines.toSorted(), [`size 320x480`, `theme ${DARK}`].toSorted());

  lines.length = 0;
  mounted.set({ isShown: false });
  assert.equal(element.listenerCount, 0, "the events are unsubscribed");
  assert.deepEqual(lines.toSorted(), ["size 0x0", "theme undefined"].toSorted());
  mounted.unmount();
});
