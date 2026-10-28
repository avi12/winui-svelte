import { registerControls, setClassHandler } from "./host.ts";
import type { NativeValue } from "#src/native-value.js";
import {
  FakeBorder,
  FakeButton,
  fakeControls,
  FakeFlyout,
  FakeMenuItem,
  FakePanel,
  FakeTextBlock,
  FakeToggle
} from "#src/renderer/testing/fake-controls.js";
import { svelteHooks } from "#src/vite/loader.js";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import { test } from "node:test";

// The WinUI renderer's host (host.ts) run on stand-in controls: a real
// component, the real renderer, the control attachment, unmounting and what a
// removed subtree lets go of.

registerControls(fakeControls);
setClassHandler((control, value) => {
  Object.assign(control, { className: value });
});
registerHooks(svelteHooks(path.join(import.meta.dirname, "host.ts")));
const { mountControl } = await import("./mount.svelte.ts");
const { default: Fixture } = await import("#src/renderer/testing/Host.fixture.svelte");
const { default: PropertyFixture } = await import("#src/renderer/testing/Property.fixture.svelte");
const { default: ReorderableFixture } = await import("#src/renderer/testing/Reorderable.fixture.svelte");
const { default: TextFixture } = await import("#src/renderer/testing/Text.fixture.svelte");

interface TextProps extends Record<string, NativeValue> {
  version: string;
  status: string;
  count: number;
}

interface Props extends Record<string, NativeValue> {
  isOn: boolean;
  label: string;
  isShown: boolean;
  log: (line: string) => void;
  hosted: object;
}

function mountFixture(overrides: Partial<Props> = {}) {
  const lines: string[] = [];
  const hosted = new FakeBorder();
  const mounted = mountControl<Props>({
    component: Fixture,
    props: {
      isOn: false,
      label: "On",
      isShown: false,
      log: line => lines.push(line),
      hosted,
      ...overrides
    }
  });
  // Typed as the WinUI control it stands in for.
  const root: object = mounted.root;
  assert.ok(root instanceof FakePanel);
  const [toggle, staticToggle] = root.children.items;
  assert.ok(toggle instanceof FakeToggle);
  assert.ok(staticToggle instanceof FakeToggle);
  return {
    mounted,
    root,
    toggle,
    staticToggle,
    lines,
    hosted
  };
}

test("class goes to the app's class handler", () => {
  const { root } = mountFixture();
  assert.equal(root.className, "card");
});

test("the control attachment hands over the typed control and its effects follow the props", () => {
  const { mounted, toggle, lines } = mountFixture({ isOn: true });
  assert.deepEqual(lines, ["attached"]);
  assert.equal(toggle.isOn, true);

  mounted.set({ isOn: false });
  assert.equal(toggle.isOn, false, "an effect inside the attachment re-runs on its own");
  assert.deepEqual(lines, ["attached"], "without attaching again");
});

test("on-content={() => value} is the property OnContent, read when the element is made", () => {
  const { mounted, toggle, staticToggle } = mountFixture({ label: "Active" });
  assert.equal(toggle.onContent, "Active");
  assert.equal(staticToggle.onContent, "Static");

  mounted.set({ label: "Running" });
  assert.equal(toggle.onContent, "Active", "a property that changes is set through the attachment");
});

test("unmount runs the attachment's cleanup and ends the event subscriptions", () => {
  const { mounted, toggle, lines } = mountFixture();
  assert.equal(toggle.subscriptions, 1);

  mounted.unmount();
  assert.deepEqual(lines, ["attached", "cleanup"]);
  assert.equal(toggle.subscriptions, 0);
});

test("a removed subtree ends its subscriptions and releases the control it hosted", () => {
  const { mounted, root, hosted } = mountFixture({ isShown: true });
  const [, , panel] = root.children.items;
  assert.ok(panel instanceof FakePanel);
  const [inner, host] = panel.children.items;
  assert.ok(inner instanceof FakeToggle);
  assert.equal(inner.subscriptions, 1);
  assert.equal(host, hosted, "the hosted control is placed in the subtree");

  mounted.set({ isShown: false });
  assert.equal(root.children.items.length, 2, "the subtree leaves its parent");
  assert.equal(inner.subscriptions, 0);
  assert.equal(panel.children.items.includes(hosted), false, "the hosted control leaves the discarded panel");
});

test("a hosted control can be placed again after its subtree is removed", () => {
  const { mounted, root, hosted } = mountFixture({ isShown: true });
  mounted.set({ isShown: false });
  mounted.set({ isShown: true });
  const [, , panel] = root.children.items;
  assert.ok(panel instanceof FakePanel);
  assert.equal(panel.children.items.includes(hosted), true);
});

function textsOf(panel: FakePanel) {
  return panel.children.items.map(item => (item instanceof FakeTextBlock ? item.text : null));
}

// The fixture's last block, as a browser shows it: its line breaks and
// indentation collapse to single spaces, its no-break space stays.
const WRAPPED_SENTENCE = "A sentence long enough to wrap over lines, indented.";

test("text written as children is a text block's text, and follows what it shows", () => {
  const mounted = mountControl<TextProps>({
    component: TextFixture,
    props: {
      version: "0.2.0",
      status: "Saved",
      count: 2
    }
  });
  const root: object = mounted.root;
  assert.ok(root instanceof FakePanel);
  assert.deepEqual(textsOf(root), [
    "My app 0.2.0 is ready",
    "Saved",
    "Saved 2 themes",
    WRAPPED_SENTENCE
  ]);

  mounted.set({
    version: "0.3.0",
    status: "",
    count: 3
  });
  assert.deepEqual(textsOf(root), ["My app 0.3.0 is ready", "", "Saved 3 themes", WRAPPED_SENTENCE]);
  mounted.unmount();
});

// Read afresh each time: an earlier assertion narrows the property's type.
function flyoutOf(button: FakeButton) {
  return button.flyout;
}

test("a <property> element fills its parent's property and gives it back when it goes", () => {
  const mounted = mountControl<{
    isShown: boolean;
    label: string;
  }>({
    component: PropertyFixture,
    props: {
      isShown: false,
      label: "Open"
    }
  });
  const root: object = mounted.root;
  assert.ok(root instanceof FakePanel);
  const [menuButton, conditionalButton, menuItem, panel] = root.children.items;
  assert.ok(menuButton instanceof FakeButton);
  assert.ok(conditionalButton instanceof FakeButton);
  assert.ok(menuItem instanceof FakeMenuItem);
  assert.ok(panel instanceof FakePanel);
  assert.ok(menuButton.flyout instanceof FakeFlyout);
  assert.ok(menuButton.flyout.content instanceof FakeTextBlock);
  assert.equal(menuButton.content, "initial", "a parent of <property> elements only keeps its own content");
  assert.equal(flyoutOf(conditionalButton), null);
  assert.equal(menuItem.text, "Open");
  assert.deepEqual(textsOf(panel), ["First"]);

  mounted.set({
    isShown: true,
    label: "Close"
  });
  assert.ok(flyoutOf(conditionalButton) instanceof FakeFlyout);
  assert.equal(menuItem.text, "Close");
  assert.deepEqual(textsOf(panel), ["First", "Second"]);

  mounted.set({
    isShown: false,
    label: "Close"
  });
  assert.equal(flyoutOf(conditionalButton), null);
  assert.deepEqual(textsOf(panel), ["First"]);
  mounted.unmount();
});

test("a child the control reordered itself stays in step with the tree", () => {
  const mounted = mountControl<{ items: string[] }>({
    component: ReorderableFixture,
    props: {
      items: ["a", "b", "c", "d"]
    }
  });
  const root: object = mounted.root;
  assert.ok(root instanceof FakePanel);
  assert.deepEqual(textsOf(root), ["a", "b", "c", "d"]);

  root.children.moveNatively({
    from: 0,
    to: 2
  });
  assert.deepEqual(textsOf(root), ["b", "c", "a", "d"]);

  mounted.set({ items: ["b", "c", "d"] });
  assert.deepEqual(textsOf(root), ["b", "c", "d"], "the item that went is the one removed");

  mounted.set({ items: ["b", "c", "d", "e"] });
  assert.deepEqual(textsOf(root), ["b", "c", "d", "e"], "and one added lands at the end");

  root.children.moveNatively({
    from: 3,
    to: 0
  });
  mounted.set({ items: ["e", "b", "c", "d"] });
  assert.deepEqual(textsOf(root), ["e", "b", "c", "d"], "a move the tree also made is no further move");
  mounted.unmount();
});
