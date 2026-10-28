import type { SelectedVector, SelectionBound, SelectionView } from "./key-selection.ts";
import { inListOrder, KeySelection, sameKeys, SelectionKind } from "./key-selection.ts";
import type { KeyBox } from "./key-vector.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// Keys held as {text}, so a selected item is not its key's string.
interface Held {
  text: string;
}

const codec: KeyBox<Held> = {
  box: key => ({ text: key }),
  unbox: held => held.text
};

class FakeSelected implements SelectedVector<Held> {
  readonly held: Held[] = [];
  readonly writes: string[] = [];

  get size() {
    return this.held.length;
  }

  getAt(index: number) {
    const held = this.held[index];
    const isPresent = held !== undefined;
    if (!isPresent) {
      throw new RangeError(`no entry at ${index}`);
    }

    return held;
  }

  clear() {
    this.held.length = 0;
    this.writes.push("clear");
  }

  append(held: Held) {
    this.held.push(held);
    this.writes.push(`append ${held.text}`);
  }
}

function setup({ kind = SelectionKind.SINGLE, order = ["a", "b", "c", "d"], bound = {}, isPaused = false }: {
  kind?: SelectionKind;
  order?: string[];
  bound?: SelectionBound;
  isPaused?: boolean;
} = {}) {
  const selected = new FakeSelected();
  const state = {
    order,
    isPaused
  };
  const view: SelectionView<Held> = {
    kind,
    selected,
    boxOf: key => codec.box(key)
  };
  const selection = new KeySelection({
    view,
    codec,
    bound,
    order: () => state.order,
    isPaused: () => state.isPaused
  });
  return {
    selection,
    selected,
    bound,
    state
  };
}

test("the key the app binds is the control's selection", () => {
  const { selection, selected } = setup({
    bound: {
      selectedKey: "c"
    }
  });
  selection.apply();
  assert.deepEqual(selected.held, [{ text: "c" }]);
});

test("a key that is already selected is not selected again", () => {
  const { selection, selected } = setup({
    bound: {
      selectedKey: "c"
    }
  });
  selection.apply();
  selected.writes.length = 0;
  selection.apply();
  assert.deepEqual(selected.writes, []);
});

test("no key clears the selection", () => {
  const { selection, selected, bound } = setup({
    bound: {
      selectedKey: "c"
    }
  });
  selection.apply();
  bound.selectedKey = undefined;
  selection.apply();
  assert.deepEqual(selected.held, []);
});

test("the user's choice is written to both bound props", () => {
  const { selection, selected, bound } = setup();
  selected.append(codec.box("b"));
  selection.changed();
  assert.equal(bound.selectedKey, "b");
  assert.deepEqual(bound.selectedKeys, ["b"]);

  selected.clear();
  selection.changed();
  assert.equal(bound.selectedKey, undefined);
  assert.deepEqual(bound.selectedKeys, []);
});

test("a selection the app made is not written back as the user's choice", () => {
  const { selection, bound } = setup({
    bound: {
      selectedKey: "b"
    }
  });
  selection.apply();
  assert.equal(bound.selectedKey, "b");
  assert.equal(bound.selectedKeys, undefined);
});

test("a control that loses its selection while its items change keeps the app's key, and gets the selection back", () => {
  const { selection, selected, bound, state } = setup({
    bound: {
      selectedKey: "b"
    }
  });
  selection.apply();

  state.isPaused = true;
  selected.clear();
  selection.changed();
  assert.equal(bound.selectedKey, "b", "the loss is not reported");

  state.isPaused = false;
  state.order = ["b", "a", "c", "d"];
  selection.apply();
  assert.deepEqual(selected.held, [{ text: "b" }], "the key is selected again in its new place");
});

test("a key whose item went is dropped from what the app holds", () => {
  const { selection, selected, bound, state } = setup({
    bound: {
      selectedKey: "b"
    }
  });
  selection.apply();
  state.order = ["a", "c", "d"];
  selected.clear();
  selection.apply();
  assert.equal(bound.selectedKey, undefined);
  assert.deepEqual(selected.held, []);
});

test("multiple selection follows selectedKeys, in the list's order", () => {
  const { selection, selected, bound } = setup({
    kind: SelectionKind.MULTIPLE,
    bound: {
      selectedKeys: ["d", "b"]
    }
  });
  selection.apply();
  assert.deepEqual(selected.held.map(held => held.text), ["b", "d"]);

  selected.append(codec.box("a"));
  selection.changed();
  assert.deepEqual(bound.selectedKeys, ["a", "b", "d"]);
  assert.equal(bound.selectedKey, "a", "selectedKey is the first of them");
});

test("a list nobody can select in is left alone", () => {
  const { selection, selected } = setup({
    kind: SelectionKind.NONE,
    bound: {
      selectedKey: "a"
    }
  });
  selection.apply();
  assert.deepEqual(selected.writes, []);
});

test("inListOrder and sameKeys compare keys, not positions of the input", () => {
  assert.deepEqual(
    inListOrder({
      keys: ["c", "x", "a"],
      order: ["a", "b", "c"]
    }), ["a", "c"]
  );
  assert.equal(
    sameKeys({
      first: ["a", "b"],
      second: ["b", "a"]
    }), true
  );
  assert.equal(
    sameKeys({
      first: ["a", "b"],
      second: ["a", "c"]
    }), false
  );
});
