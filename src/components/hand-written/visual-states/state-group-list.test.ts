import { StateGroupList } from "./state-group-list.ts";
import type { GroupCollection } from "./state-group-list.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

function fakeCollection() {
  const items: string[] = [];
  const collection: GroupCollection<string> = {
    append(group) {
      items.push(group);
    },
    insertAt(position, group) {
      items.splice(position, 0, group);
    },
    removeAt(position) {
      items.splice(position, 1);
    },
    indexOf(group) {
      return items.indexOf(group);
    }
  };
  return {
    items,
    collection
  };
}

test("groups placed before the list is bound reach the element's collection in order", () => {
  const list = new StateGroupList<string>();
  list.insertAt(0, "wide");
  list.insertAt(0, "narrow");
  const { items, collection } = fakeCollection();
  list.bind(collection);
  assert.deepEqual(items, ["narrow", "wide"]);
});

test("groups placed and taken out after the bind follow into the collection", () => {
  const list = new StateGroupList<string>();
  const { items, collection } = fakeCollection();
  list.bind(collection);
  list.insertAt(0, "a");
  list.insertAt(1, "c");
  list.insertAt(1, "b");
  assert.deepEqual(items, ["a", "b", "c"]);
  list.removeAt(1);
  assert.deepEqual(items, ["a", "c"]);
  assert.equal(list.indexOf("c"), 1);
});

test("releasing takes only the list's groups out and a second bind refills", () => {
  const list = new StateGroupList<string>();
  const { items, collection } = fakeCollection();
  items.push("own");
  list.insertAt(0, "a");
  list.bind(collection);
  assert.deepEqual(items, ["own", "a"]);
  list.release();
  assert.deepEqual(items, ["own"]);
  list.bind(collection);
  assert.deepEqual(items, ["own", "a"]);
});
