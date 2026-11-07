import { createPicker } from "./flyout-picker.ts";
import { resolveMenu } from "./menu/resolve.ts";
import { MenuItemKind } from "./menu/types.ts";
import type { MenuItem } from "./menu/types.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The picker against a fake flyout: it records what was asked of it, in order.

function setup(declare: (log: string[]) => readonly MenuItem[]) {
  const log: string[] = [];
  const deferred: Array<() => void> = [];
  const [first] = resolveMenu({ items: declare(log) });
  const isPickable = first !== undefined
    && first.kind !== MenuItemKind.SEPARATOR
    && first.kind !== MenuItemKind.HEADER
    && first.kind !== MenuItemKind.SUBMENU;
  assert.ok(isPickable);
  const picker = createPicker({
    close: () => log.push("close"),
    refresh: () => log.push("refresh"),
    defer: run => deferred.push(run)
  });
  return {
    log,
    deferred,
    first,
    picker
  };
}

test("a pick runs after the flyout closed, on the next turn", () => {
  const { log, deferred, first, picker } = setup(trace => [{
    kind: MenuItemKind.COMMAND,
    id: "open",
    label: "Open",
    onselect: () => trace.push("select")
  }]);
  picker.pick(first);
  assert.deepEqual(log, [], "nothing runs while the flyout is open");
  picker.settle();
  assert.deepEqual(log, ["close"], "the menu ends first");
  deferred[0]?.();
  assert.deepEqual(log, ["close", "select"]);
});

test("an item that is not to wait runs at the pick", () => {
  const { log, deferred, first, picker } = setup(trace => [{
    kind: MenuItemKind.COMMAND,
    id: "now",
    label: "Now",
    closeThenRun: false,
    onselect: () => trace.push("select")
  }]);
  picker.pick(first);
  picker.settle();
  assert.deepEqual(log, ["select", "close"]);
  assert.equal(deferred.length, 0);
});

test("a close with no pick is a dismissal", () => {
  const { log, deferred, picker } = setup(() => [{
    kind: MenuItemKind.COMMAND,
    id: "open",
    label: "Open"
  }]);
  picker.settle();
  assert.deepEqual(log, ["close"]);
  assert.equal(deferred.length, 0);
});

test("a staysOpen item runs and the flyout is built again, not closed", () => {
  let isOn = false;
  const { log, deferred, first, picker } = setup(trace => [{
    kind: MenuItemKind.CHECK,
    id: "auto",
    label: "Auto",
    staysOpen: true,
    isChecked: () => isOn,
    onselect() {
      isOn = !isOn;
      trace.push("select");
    }
  }]);
  picker.pick(first);
  picker.settle();
  assert.deepEqual(log, ["select", "refresh"], "the state changed before the new flyout reads it");
  assert.equal(deferred.length, 0);

  picker.settle();
  assert.deepEqual(log, ["select", "refresh", "close"], "a close that picked nothing ends it");
});
