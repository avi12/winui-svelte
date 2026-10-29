import type { TreeNodeFace } from "./keyed-tree.ts";
import { KeyedTree } from "./keyed-tree.ts";
import type { KeyedItems } from "#src/renderer/list/keyed-list.js";
import assert from "node:assert/strict";
import { test } from "node:test";

interface Folder {
  key: string;
  children?: Folder[];
}

class FakeNode implements TreeNodeFace<FakeNode> {
  readonly key: string;
  readonly children = new FakeLevel();
  isExpanded = false;
  hasUnrealizedChildren = false;

  constructor(key: string) {
    this.key = key;
  }
}

class FakeLevel implements KeyedItems<FakeNode> {
  readonly nodes: FakeNode[] = [];
  readonly writes: string[] = [];

  get size() {
    return this.nodes.length;
  }

  getAt(index: number) {
    const node = this.nodes[index];
    const isPresent = node !== undefined;
    if (!isPresent) {
      throw new RangeError(`no node at ${index}`);
    }

    return node;
  }

  removeAt(index: number) {
    this.writes.push(`remove ${this.getAt(index).key}`);
    this.nodes.splice(index, 1);
  }

  // A property, not a method: its two positional parameters are IVector's.
  readonly insertAt = (index: number, node: FakeNode) => {
    this.writes.push(`insert ${node.key}`);
    this.nodes.splice(index, 0, node);
  };

  get keys() {
    return this.nodes.map(node => node.key);
  }
}

function setup(expanded: string[] = []) {
  const isExpanded = new Set(expanded);
  const roots = new FakeLevel();
  const tree = new KeyedTree<Folder, FakeNode>({
    items: {
      keyOf: folder => folder.key,
      childrenOf: folder => folder.children ?? [],
      isExpanded: key => isExpanded.has(key)
    },
    nodes: {
      create: key => new FakeNode(key),
      keyOf: node => node.key
    }
  });
  return {
    tree,
    roots,
    isExpanded
  };
}

const docs: Folder[] = [
  {
    key: "src",
    children: [{ key: "app" }, {
      key: "lib",
      children: [{ key: "util" }]
    }]
  },
  { key: "readme" }
];

test("only the roots are made while nothing is expanded, and a node with children says it has some", () => {
  const { tree, roots } = setup();
  tree.sync({
    roots,
    items: docs
  });
  assert.deepEqual(roots.keys, ["src", "readme"]);
  assert.equal(roots.getAt(0).hasUnrealizedChildren, true);
  assert.equal(roots.getAt(0).children.size, 0);
  assert.equal(roots.getAt(1).hasUnrealizedChildren, false);
  assert.deepEqual(tree.order, ["src", "readme"]);
});

test("an expanded key has its children made, down to the expanded ones, and the node is expanded", () => {
  const { tree, roots } = setup(["src", "lib"]);
  tree.sync({
    roots,
    items: docs
  });
  const src = roots.getAt(0);
  assert.equal(src.isExpanded, true);
  assert.equal(src.hasUnrealizedChildren, false);
  assert.deepEqual(src.children.keys, ["app", "lib"]);
  assert.equal(src.children.getAt(1).isExpanded, true);
  assert.deepEqual(src.children.getAt(1).children.keys, ["util"]);
  assert.deepEqual(tree.order, ["src", "app", "lib", "util", "readme"]);
});

test("expanding a key afterwards makes its children without touching the rest", () => {
  const { tree, roots, isExpanded } = setup();
  tree.sync({
    roots,
    items: docs
  });
  roots.writes.length = 0;
  isExpanded.add("src");
  tree.syncChildren("src");
  assert.deepEqual(roots.getAt(0).children.keys, ["app", "lib"]);
  assert.equal(roots.getAt(0).hasUnrealizedChildren, false);
  assert.deepEqual(roots.writes, []);
  assert.equal(tree.nodeOf("lib")?.key, "lib");
  assert.deepEqual(tree.order, ["src", "app", "lib", "readme"]);
});

test("a reorder, an insertion and a removal keep the nodes that stay", () => {
  const { tree, roots } = setup(["src"]);
  tree.sync({
    roots,
    items: docs
  });
  const [src, readme] = roots.nodes;
  const app = src?.children.getAt(0);
  roots.writes.length = 0;
  tree.sync({
    roots,
    items: [
      { key: "notes" },
      {
        key: "src",
        children: [{
          key: "lib",
          children: []
        }, { key: "app" }]
      }
    ]
  });
  assert.deepEqual(roots.keys, ["notes", "src"]);
  assert.equal(roots.getAt(1), src);
  assert.equal(src?.children.getAt(1), app);
  assert.equal(readme === undefined || roots.nodes.includes(readme), false);
  assert.deepEqual(roots.writes, ["remove readme", "insert notes"]);
});

test("a node whose item lost its children has none, and no longer says it has", () => {
  const { tree, roots } = setup(["src"]);
  tree.sync({
    roots,
    items: docs
  });
  tree.sync({
    roots,
    items: [{ key: "src" }, { key: "readme" }]
  });
  assert.equal(roots.getAt(0).children.size, 0);
  assert.equal(roots.getAt(0).hasUnrealizedChildren, false);
  assert.deepEqual(tree.order, ["src", "readme"]);
});

test("a collapsed node that had its children keeps them in step with the items", () => {
  const { tree, roots, isExpanded } = setup(["src"]);
  tree.sync({
    roots,
    items: docs
  });
  isExpanded.delete("src");
  tree.sync({
    roots,
    items: [{
      key: "src",
      children: [{ key: "bin" }]
    }, { key: "readme" }]
  });
  assert.equal(roots.getAt(0).isExpanded, false);
  assert.deepEqual(roots.getAt(0).children.keys, ["bin"]);
});

test("an item that moves to another parent is a new node, and its old node is gone", () => {
  const { tree, roots } = setup(["src", "lib"]);
  tree.sync({
    roots,
    items: docs
  });
  const util = tree.nodeOf("util");
  tree.sync({
    roots,
    items: [
      {
        key: "src",
        children: [{
          key: "app",
          children: [{ key: "util" }]
        }, { key: "lib" }]
      }
    ]
  });
  assert.notEqual(tree.nodeOf("util"), util);
  assert.equal(tree.nodeOf("lib")?.children.size, 0);
});

test("the same key twice in the tree throws, in the same level or in two", () => {
  const { tree, roots } = setup(["src"]);
  assert.throws(
    () => tree.sync({
      roots,
      items: [{ key: "a" }, { key: "a" }]
    }),
    /two items have the key "a"/u
  );
  assert.throws(
    () => setup(["src"]).tree.sync({
      roots: new FakeLevel(),
      items: [{
        key: "src",
        children: [{ key: "readme" }]
      }, { key: "readme" }]
    }),
    /two items have the key "readme"/u
  );
});

test("entries are the items by key, and a key without a node has none", () => {
  const { tree, roots } = setup(["src"]);
  tree.sync({
    roots,
    items: docs
  });
  const entries = tree.entries();
  assert.equal(entries.get("app"), docs[0]?.children?.[0]);
  assert.equal(entries.has("util"), false);
  assert.equal(tree.nodeOf("util"), undefined);
});
