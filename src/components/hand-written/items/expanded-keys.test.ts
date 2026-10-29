import type { ExpandedBound } from "./expanded-keys.ts";
import { ExpandedKeys } from "./expanded-keys.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

function setup(bound: ExpandedBound = {}) {
  const expanded = new ExpandedKeys({
    bound,
    order: () => ["a", "a1", "b", "c"]
  });
  return {
    expanded,
    bound
  };
}

test("nothing is expanded until the app says so or the user expands", () => {
  const { expanded } = setup();
  assert.equal(expanded.has("a"), false);
  assert.equal(expanded.adopt(), false);
});

test("the app's keys become the expanded ones, once", () => {
  const { expanded } = setup({ expandedKeys: ["b", "a"] });
  assert.equal(expanded.adopt(), true);
  assert.equal(expanded.has("a") && expanded.has("b"), true);
  assert.equal(expanded.adopt(), false);
});

test("a key the user expands is reported in the tree's order, with the keys not shown after", () => {
  const { expanded, bound } = setup({ expandedKeys: ["c", "hidden"] });
  expanded.adopt();
  expanded.toggled({
    key: "a",
    isExpanded: true
  });
  assert.deepEqual(bound.expandedKeys, ["a", "c", "hidden"]);
  assert.equal(expanded.adopt(), false);
});

test("a key the user collapses leaves the app's keys, and collapsing a collapsed key reports nothing", () => {
  const { expanded, bound } = setup({ expandedKeys: ["a", "b"] });
  expanded.adopt();
  expanded.toggled({
    key: "a",
    isExpanded: false
  });
  assert.deepEqual(bound.expandedKeys, ["b"]);
  bound.expandedKeys = ["x"];
  expanded.toggled({
    key: "c",
    isExpanded: false
  });
  assert.deepEqual(bound.expandedKeys, ["x"]);
});

test("a tree whose keys are not bound keeps what the user did and hands it to the app", () => {
  const { expanded, bound } = setup();
  expanded.toggled({
    key: "b",
    isExpanded: true
  });
  assert.equal(expanded.has("b"), true);
  assert.deepEqual(bound.expandedKeys, ["b"]);
});
