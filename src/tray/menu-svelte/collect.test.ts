import { collectMenu } from "./collect.ts";
import { probeRenderer } from "#src/renderer/testing/tree-probe.js";
import { NodeType } from "#src/renderer/tree/tree.js";
import { resolveMenu } from "#src/tray/menu/resolve.js";
import { MenuItemKind, MenuLevel } from "#src/tray/menu/types.js";
import type { MenuItem } from "#src/tray/menu/types.js";
import { svelteHooks } from "#src/vite/loader.js";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// The markup components through the headless tree: collectMenu gives the
// model's own items, in the order written, with every prop typed.

registerHooks(svelteHooks());
const { flushSync } = await import("svelte");
const { mountOnTree } = await import("#src/renderer/tree/document.js");
const { default: Markup } = await import("./Markup.fixture.svelte");

interface MarkupExports {
  showNames(next: string[]): void;
  setAutostart(isOn: boolean): void;
  showHeader(isShown: boolean): void;
}

function isMarkupExports(value: object): value is MarkupExports {
  return "showNames" in value && "setAutostart" in value && "showHeader" in value;
}

function mountMarkup(onopen: () => void) {
  const target = probeRenderer.createFragment();
  const markup = mountOnTree({
    component: Markup,
    props: {
      onopen
    },
    renderer: probeRenderer,
    target
  });
  assert.ok(isMarkupExports(markup));
  flushSync();
  const root = target.children.find(child => child.type === NodeType.ELEMENT);
  assert.ok(root?.type === NodeType.ELEMENT);
  return {
    markup,
    root
  };
}

function idsOf(items: readonly MenuItem[]) {
  return items.map(item => item.id);
}

function childrenOfRecent(items: readonly MenuItem[]) {
  const submenu = items.find(item => item.kind === MenuItemKind.SUBMENU);
  assert.ok(submenu?.kind === MenuItemKind.SUBMENU);
  assert.ok(typeof submenu.items !== "function", "markup gives the children as a list");
  return submenu.items;
}

test("the lines come out in the order written, with the props as the model has them", () => {
  let opened = 0;
  const { root } = mountMarkup(() => {
    opened++;
  });
  const items = collectMenu(root);
  assert.deepEqual(idsOf(items), ["title", "open", "divider", "autostart", "recent", "mode.fast"]);

  const open = items.find(item => item.id === "open");
  assert.ok(open?.kind === MenuItemKind.COMMAND);
  assert.equal(open.shortcut, "Ctrl+O");
  open.onselect?.({ item: open });
  assert.equal(opened, 1, "a function prop arrives as the function");

  const autostart = items.find(item => item.id === "autostart");
  assert.ok(autostart?.kind === MenuItemKind.CHECK);
  assert.equal(autostart.isChecked, false, "a boolean prop arrives as a boolean");
  assert.equal(autostart.level, MenuLevel.STANDARD);

  const radio = items.find(item => item.id === "mode.fast");
  assert.ok(radio?.kind === MenuItemKind.RADIO);
  assert.equal(radio.group, "mode");
  assert.equal(radio.isChecked, true);
});

test("a keyed each inside a submenu is its children, and follows the state", () => {
  const { markup, root } = mountMarkup(() => {});
  assert.deepEqual(idsOf(childrenOfRecent(collectMenu(root))), ["recent.alpha", "recent.beta"]);

  markup.showNames(["beta", "gamma", "alpha"]);
  flushSync();
  assert.deepEqual(idsOf(childrenOfRecent(collectMenu(root))), ["recent.beta", "recent.gamma", "recent.alpha"]);

  markup.showNames([]);
  flushSync();
  assert.deepEqual(childrenOfRecent(collectMenu(root)), []);
});

test("a changed prop and an if block are read the next time the menu is collected", () => {
  const { markup, root } = mountMarkup(() => {});
  markup.setAutostart(true);
  markup.showHeader(false);
  flushSync();
  const items = collectMenu(root);
  assert.equal(items[0]?.id, "open", "the header went with its if");
  const autostart = items.find(item => item.id === "autostart");
  assert.ok(autostart?.kind === MenuItemKind.CHECK);
  assert.equal(autostart.isChecked, true);
});

test("the collected lines resolve by level and show an empty submenu as its label", () => {
  const { markup, root } = mountMarkup(() => {});
  markup.showNames([]);
  flushSync();
  const resolved = resolveMenu({ items: collectMenu(root) });
  assert.deepEqual(resolved.map(entry => entry.id), ["title", "open", "divider", "recent", "mode.fast"], "the standard line is above the simple level");
  const recent = resolved.find(entry => entry.id === "recent");
  assert.ok(recent?.kind === MenuItemKind.SUBMENU);
  assert.deepEqual(recent.items.map(entry => entry.id), ["recent.empty"]);
});
