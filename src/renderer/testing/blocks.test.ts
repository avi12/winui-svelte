import type { ProbeElement } from "./tree-probe.ts";
import { outline, probeRenderer } from "./tree-probe.ts";
import { NodeType } from "#src/renderer/tree/tree.js";
import { svelteHooks } from "#src/vite/loader.js";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// A real component through the tree: {#if} and keyed {#each} anchor on
// comments, insert before them, and a reorder moves the same nodes.

registerHooks(svelteHooks());
const { flushSync } = await import("svelte");
const { mountOnTree } = await import("#src/renderer/tree/document.js");
const { default: Blocks } = await import("./Blocks.fixture.svelte");

// What the fixture exports, which its component type does not say.
interface BlocksExports {
  showItems(next: string[]): void;
  showHeader(isShown: boolean): void;
}

function isBlocksExports(value: object): value is BlocksExports {
  return "showItems" in value && "showHeader" in value;
}

function elementsOf(panel: ProbeElement) {
  return panel.children.flatMap(child => child.type === NodeType.ELEMENT ? [child] : []);
}

// The panel's text blocks, by their text: what the window would show.
function shown(panel: ProbeElement) {
  return elementsOf(panel).map(element => outline(element).replaceAll(/^text-block\("|"\)$/gu, "")).join(",");
}

test("{#if} and keyed {#each} render, update and reorder through the tree", () => {
  const target = probeRenderer.createFragment();
  const blocks = mountOnTree({
    component: Blocks,
    props: {},
    renderer: probeRenderer,
    target
  });
  assert.ok(isBlocksExports(blocks));
  flushSync();
  const [panel] = target.children;
  assert.ok(panel?.type === NodeType.ELEMENT);
  assert.equal(shown(panel), "header,a,b,c,footer");

  const [, itemA, itemB, itemC] = elementsOf(panel);
  blocks.showItems(["c", "a", "b"]);
  flushSync();
  assert.equal(shown(panel), "header,c,a,b,footer", "a keyed reorder");
  const [, movedC, movedA, movedB] = elementsOf(panel);
  assert.ok(movedC === itemC && movedA === itemA && movedB === itemB, "moves the same nodes");

  blocks.showItems(["a", "d"]);
  flushSync();
  assert.equal(shown(panel), "header,a,d,footer", "removes and adds by key");

  blocks.showHeader(false);
  flushSync();
  assert.equal(shown(panel), "a,d,footer", "an {#if} turned off leaves");

  blocks.showHeader(true);
  flushSync();
  assert.equal(shown(panel), "header,a,d,footer", "and comes back before its anchor");

  blocks.showItems([]);
  flushSync();
  assert.equal(shown(panel), "header,footer", "an emptied {#each}");
});
