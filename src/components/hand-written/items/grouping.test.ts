import { groupItems, groupRowKey, isGroupRowKey } from "./grouping.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const fruit = [
  {
    name: "apple",
    color: "red"
  },
  {
    name: "lime",
    color: "green"
  },
  {
    name: "cherry",
    color: "red"
  },
  {
    name: "kiwi",
    color: "green"
  },
  {
    name: "plum",
    color: "purple"
  }
];

test("items are grouped in the order their groups first appear, each group in the items' order", () => {
  const groups = groupItems({
    items: fruit,
    groupBy: item => item.color
  });
  assert.deepEqual(groups.map(group => group.key), ["red", "green", "purple"]);
  assert.deepEqual(groups.map(group => group.items.map(item => item.name)), [
    ["apple", "cherry"],
    ["lime", "kiwi"],
    ["plum"]
  ]);
});

test("no items make no groups", () => {
  assert.deepEqual(
    groupItems({
      items: [],
      groupBy: () => "x"
    }), []
  );
});

test("a group's header key is not an item's key", () => {
  assert.equal(isGroupRowKey(groupRowKey("red")), true);
  assert.equal(isGroupRowKey("red"), false);
  assert.equal(isGroupRowKey("group:red"), false);
  assert.notEqual(groupRowKey("a"), groupRowKey("b"));
});
