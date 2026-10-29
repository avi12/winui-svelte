import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The tree example (examples/tree) in a real WinUI window, off screen and never
// activated: a TreeView of items, each a Svelte component. Skipped where the
// Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const ROOT_COUNT = 3;
const MANY_ROOTS = 2000;
// A 640 pixel window shows 20 rows; the list also realizes a few pages beyond
// its edges (ItemsStackPanel.CacheLength), about 94 in all.
const MOST_CONTAINERS = 150;

test("a tree makes nodes for what is open, keeps the expanded keys and follows the items", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/tree/main.ts" });
  try {
    // Closed: a node for each root, saying it has children it has not made, and a row for each.
    const opened = await example.settled({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.deepEqual(opened["tree"], ["node-0?", "node-1?", "node-2?"]);
    assert.equal(
      numberOf({
        report: opened,
        field: "live"
      }), ROOT_COUNT
    );

    // The user opens a node: its children are made as the control asks, and the keys follow.
    const expanded = await example.settled({
      command: {
        cmd: "expand",
        key: "node-0"
      },
      kind: "expanded"
    });
    assert.deepEqual(expanded["tree"], ["node-0+", "  node-0-0?", "  node-0-1?", "node-1?", "node-2?"]);
    assert.deepEqual(expanded["expandedKeys"], ["node-0"]);
    assert.equal(
      numberOf({
        report: expanded,
        field: "live"
      }), ROOT_COUNT + 2
    );

    // The app opens keys: the nodes follow, the tree's order is the keys' order.
    const opening = await example.settled({
      command: {
        cmd: "expandKeys",
        keys: ["node-0-1", "node-0"]
      },
      kind: "expandedKeys"
    });
    assert.deepEqual(opening["tree"], ["node-0+", "  node-0-0?", "  node-0-1+", "    node-0-1-0", "    node-0-1-1", "node-1?", "node-2?"]);

    // A rename reaches the row without a new one; a new child is a new row and a new node.
    const before = numberOf({
      report: opening,
      field: "created"
    });
    const renamed = await example.settled({
      command: {
        cmd: "rename",
        key: "node-0-1",
        name: "Renamed"
      },
      kind: "renamed"
    });
    assert.equal(
      numberOf({
        report: renamed,
        field: "created"
      }), before
    );
    const added = await example.settled({
      command: {
        cmd: "add",
        parent: "node-0",
        key: "node-0-new"
      },
      kind: "added"
    });
    assert.deepEqual(added["tree"], ["node-0+", "  node-0-0?", "  node-0-1+", "    node-0-1-0", "    node-0-1-1", "  node-0-new", "node-1?", "node-2?"]);
    assert.equal(
      numberOf({
        report: added,
        field: "created"
      }), before + 1
    );

    // An item that goes takes its node, its children's nodes and their rows with it.
    const removed = await example.settled({
      command: {
        cmd: "remove",
        key: "node-0-1"
      },
      kind: "removed"
    });
    assert.deepEqual(removed["tree"], ["node-0+", "  node-0-0?", "  node-0-new", "node-1?", "node-2?"]);
    assert.equal(
      numberOf({
        report: removed,
        field: "live"
      }), ROOT_COUNT + 2
    );

    // The roots reorder: the nodes that stay keep what they hold (node-0 is still open).
    const moved = await example.settled({
      command: {
        cmd: "moveFirst",
        key: "node-2"
      },
      kind: "moved"
    });
    assert.deepEqual(moved["tree"], ["node-2?", "node-0+", "  node-0-0?", "  node-0-new", "node-1?"]);

    // The user closes a node: the key leaves the app's, the rows end. The key
    // of the item that went stays (the app may bring the item back).
    const collapsed = await example.settled({
      command: {
        cmd: "expand",
        key: "node-0",
        expanded: false
      },
      kind: "expanded"
    });
    assert.deepEqual(collapsed["expandedKeys"], ["node-0-1"]);
    assert.equal(
      numberOf({
        report: collapsed,
        field: "live"
      }), ROOT_COUNT
    );

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});

test("the selected key follows the user's choice, and the app's choice is the control's", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/tree/main.ts" });
  try {
    await example.settled({
      command: {
        cmd: "expandKeys",
        keys: ["node-0"]
      },
      kind: "expandedKeys"
    });

    // The user picks a node (through the control): the key follows.
    const picked = await example.settled({
      command: {
        cmd: "pick",
        key: "node-0-1"
      },
      kind: "picked"
    });
    assert.equal(picked["selectedKey"], "node-0-1");
    assert.deepEqual(picked["controlSelected"], ["node-0-1"]);

    // The app picks one.
    const selected = await example.settled({
      command: {
        cmd: "select",
        key: "node-1"
      },
      kind: "selected"
    });
    assert.deepEqual(selected["controlSelected"], ["node-1"]);

    // A key whose node is not shown (its parent was never opened) is not a selection.
    const hidden = await example.settled({
      command: {
        cmd: "select",
        key: "node-2-0"
      },
      kind: "selected"
    });
    assert.deepEqual(hidden["controlSelected"], []);
    assert.equal(hidden["selectedKey"], null);

    // The selected item goes: nothing is selected, and the key is cleared.
    await example.settled({
      command: {
        cmd: "select",
        key: "node-0-0"
      },
      kind: "selected"
    });
    const removed = await example.settled({
      command: {
        cmd: "remove",
        key: "node-0-0"
      },
      kind: "removed"
    });
    assert.deepEqual(removed["controlSelected"], []);
    assert.equal(removed["selectedKey"], null);

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});

test("selecting an item in the multiple mode selects the items under it, and the keys say so", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({
    entry: "examples/tree/main.ts",
    flags: ["--selection", "multiple"]
  });
  try {
    await example.settled({
      command: {
        cmd: "expandKeys",
        keys: ["node-0"]
      },
      kind: "expandedKeys"
    });
    const selected = await example.settled({
      command: {
        cmd: "selectKeys",
        keys: ["node-0"]
      },
      kind: "selectedKeys"
    });
    assert.deepEqual(selected["controlSelected"], ["node-0", "node-0-0", "node-0-1"]);
    assert.deepEqual(selected["selectedKeys"], ["node-0", "node-0-0", "node-0-1"]);

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});

test("a tree of 2000 roots makes a row for the ones it shows only", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({
    entry: "examples/tree/main.ts",
    flags: ["--rows", String(MANY_ROOTS)]
  });
  try {
    const opened = await example.settled({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    const shown = numberOf({
      report: opened,
      field: "live"
    });
    assert.ok(shown > 5 && shown < MOST_CONTAINERS, `${shown} rows shown of ${MANY_ROOTS} roots`);

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});
