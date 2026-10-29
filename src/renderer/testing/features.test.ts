import type { ElementNode, NativeHost } from "#src/renderer/tree/tree.js";
import { createTreeRenderer, NodeType } from "#src/renderer/tree/tree.js";
import { svelteHooks } from "#src/vite/loader.js";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// Svelte's features through the DOM shim on a stock Svelte, with no window:
// events with WinUI's (sender, args), directives, blocks, snippets, context,
// lifecycle and unmount. test/interaction.test.ts does the same on real
// controls.

type Handler = (...args: unknown[]) => void;

interface Native {
  readonly handlers: Map<string, Handler[]>;
}

type Element = ElementNode<Native>;

registerHooks(svelteHooks());
const { flushSync, unmount } = await import("svelte");
const { mountOnTree } = await import("#src/renderer/tree/document.js");
const { default: Features } = await import("./Features.fixture.svelte");

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

function texts(panel: Element) {
  return elementsOf(panel).map(textOf);
}

interface FeaturesApi {
  set(next: Record<string, unknown>): void;
  doubled(): number;
}

function isFeatures(value: object): value is { api: FeaturesApi } {
  return "api" in value;
}

test("events, directives, blocks and lifecycle work through the shim", async () => {
  const log: string[] = [];
  const target = renderer.createFragment();
  const mounted = mountOnTree({
    component: Features,
    props: {
      log: (line: string) => log.push(line)
    },
    renderer,
    target
  });
  assert.ok(isFeatures(mounted));
  const { api } = mounted;
  flushSync();
  const [panel] = target.children;
  assert.ok(panel?.type === NodeType.ELEMENT);
  const [button, count, array] = elementsOf(panel);
  assert.ok(button && count && array);

  const [handler] = button.native.handlers.get("click") ?? [];
  assert.ok(handler, "onclick subscribes to click");
  handler({ sender: true }, { args: true });
  flushSync();
  assert.ok(log.includes("click:object:object"), "both arguments reach the handler");
  assert.equal(api.doubled(), 2);
  assert.ok(log.includes("effect:count=1"), "$effect reruns");
  assert.equal(textOf(count), "2", "$derived reaches the text");

  assert.equal(count.getAttribute("class"), "a cold");
  assert.equal(count.getAttribute("style"), "margin: 3px; opacity: 0.5");
  api.set({
    isHot: true,
    tag: "button-control",
    items: ["c", "a", "x"],
    key: 1
  });
  flushSync();
  assert.equal(count.getAttribute("class"), "a hot", "class: directives toggle");
  assert.equal(count.getAttribute("style"), "margin: 3px; opacity: 1", "style: directives merge");
  assert.equal(array.getAttribute("class"), "x y z", "a class array is joined");
  assert.ok(texts(panel).includes("c0") && texts(panel).includes("x2"), "keyed each");
  assert.ok(elementsOf(panel).some(element => element.name === "button-control"), "svelte:element changes tag");
  assert.ok(texts(panel).includes("key1"), "{#key} remakes");

  await new Promise(resolve => setTimeout(resolve, 0));
  flushSync();
  assert.ok(texts(panel).includes("then:done"), "{#await} resolves");

  api.set({ count: 101 });
  flushSync();
  assert.ok(texts(panel).includes("failed"), "svelte:boundary shows its failed snippet");
  assert.ok(texts(panel).includes("ctx:dark"), "context reaches a child");

  api.set({ hasChild: false });
  flushSync();
  assert.ok(!texts(panel).includes("ctx:dark"), "{#if} removes the child");

  unmount(mounted);
  flushSync();
  for (const line of ["attach", "mounted", "detach", "use-destroy", "unmounted"]) {
    assert.ok(log.includes(line), line);
  }
});
