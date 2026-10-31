import { meteredWritable } from "#examples/stores/metered.ts";
import type { ElementNode, NativeHost } from "#src/renderer/tree/tree.js";
import { createTreeRenderer, NodeType } from "#src/renderer/tree/tree.js";
import { svelteHooks } from "#src/vite/loader.js";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// svelte/store and the $store syntax through the DOM shim on a stock Svelte,
// with no window: reads, writes, derived stores, bind: into a store, blocks
// over a store, context and the subscriptions a component leaves behind.
// test/stores.test.ts does the same on real controls.

type Handler = (...args: unknown[]) => void;

interface Native {
  readonly handlers: Map<string, Handler[]>;
}

type Element = ElementNode<Native>;

registerHooks(svelteHooks());
const { flushSync, unmount } = await import("svelte");
const { derived, get, readable, writable } = await import("svelte/store");
const { mountOnTree } = await import("#src/renderer/tree/document.js");
const { default: Stores } = await import("./Stores.fixture.svelte");

function isHandler(value: unknown): value is Handler {
  return typeof value === "function";
}

const host: NativeHost<Native> = {
  create: () => ({ handlers: new Map() }),
  setAttribute() {},
  removeAttribute() {},
  childrenChanged() {},
  fragmentChanged() {},
  removed() {},
  listen(element, type, handler) {
    if (!isHandler(handler)) {
      return null;
    }

    const handlers = element.native.handlers.get(type) ?? [];
    element.native.handlers.set(type, handlers);
    handlers.push(handler);
    return () => handlers.splice(handlers.indexOf(handler), 1);
  }
};
const renderer = createTreeRenderer(host);

function elementsOf(parent: Element) {
  return parent.children.flatMap(child => child.type === NodeType.ELEMENT ? [child] : []);
}

function textOf(element: Element) {
  return element.children.flatMap(child => child.type === NodeType.TEXT ? [child.value] : []).join("");
}

function click(element: Element) {
  const [handler] = element.native.handlers.get("click") ?? [];
  assert.ok(handler, "the element listens to click");
  handler({}, {});
  flushSync();
}

test("$store reads and writes, derived stores follow, bind: reaches the store, blocks follow it", () => {
  const count = meteredWritable(writable(1));
  const double = derived(count, value => value * 2);
  const name = writable("Ada");
  const items = writable(["a"]);
  const isShown = writable(false);
  const target = renderer.createFragment();
  const mounted = mountOnTree({
    component: Stores,
    props: {
      count,
      double,
      name,
      items,
      isShown
    },
    renderer,
    target
  });
  flushSync();
  const [panel] = target.children;
  assert.ok(panel?.type === NodeType.ELEMENT);
  const root: Element = panel;
  function children() {
    return elementsOf(root);
  }

  function texts() {
    return children().map(textOf);
  }

  assert.deepEqual(texts().slice(0, 3), ["1", "2", "1"], "reads, derived, context");
  assert.ok(count.tally.active > 0);

  const [, , , setTen, addOne, field] = children();
  assert.ok(setTen && addOne && field);
  click(setTen);
  assert.deepEqual(texts().slice(0, 3), ["10", "20", "10"], "$store = value");
  assert.equal(get(count), 10);
  click(addOne);
  assert.equal(get(count), 11, "store.update");
  assert.equal(texts()[0], "11");

  click(field);
  assert.equal(get(name), "typed", "bind:value={$name} writes the store");
  assert.ok(texts().includes("typed"), "and the store's readers follow");
  name.set("again");
  flushSync();
  assert.equal(textOf(field), "again", "the store flows back into the bound child");

  items.set(["a", "b", "c"]);
  flushSync();
  assert.ok(texts().includes("c"), "{#each $items}");
  assert.ok(!texts().includes("shown"));
  isShown.set(true);
  flushSync();
  assert.ok(texts().includes("shown"), "{#if $flag}");

  unmount(mounted);
  flushSync();
  assert.equal(count.tally.active, 0, "every subscription is released on unmount");
});

test("a readable starts with its first subscriber and stops with its last", () => {
  const log: string[] = [];
  const clock = readable(0, set => {
    log.push("start");
    set(1);
    return () => log.push("stop");
  });
  assert.equal(get(clock), 1);
  assert.deepEqual(log, ["start", "stop"]);
});
