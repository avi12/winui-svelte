import { defaultProfile, defineMenu, MenuItemKind, resolveMenu } from "./index.ts";
import type { MenuIds, MenuProfile } from "./index.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// These tests prove at compile time (tsc checks test files too) that a wrong
// id, a wrong field for a kind and a radio without a group do not compile; at
// run time they only check that the valid forms work.

const menu = defineMenu([
  {
    kind: MenuItemKind.COMMAND,
    id: "open",
    label: "Open"
  },
  {
    kind: MenuItemKind.CHECK,
    id: "autostart",
    label: "Autostart",
    isChecked: true
  },
  {
    kind: MenuItemKind.RADIO,
    id: "dark",
    label: "Dark",
    group: "theme"
  },
  {
    kind: MenuItemKind.SUBMENU,
    id: "tools",
    label: "Tools",
    items: [{
      kind: MenuItemKind.COMMAND,
      id: "clean",
      label: "Clean"
    }]
  }
]);

type AppId = MenuIds<typeof menu>;

test("a profile typed against the ids of the menu accepts them, nested ones included", () => {
  const profile: MenuProfile<AppId> = {
    ...defaultProfile(),
    hidden: ["open", "clean"],
    order: {
      tools: ["clean"]
    }
  };
  assert.equal(
    resolveMenu({
      items: menu,
      profile
    }).length, 3
  );
});

test("a misspelled id in a profile does not compile", () => {
  const hidden: MenuProfile<AppId> = {
    ...defaultProfile(),
    // @ts-expect-error -- "opn" is not an id of the menu
    hidden: ["opn"]
  };
  const order: MenuProfile<AppId> = {
    ...defaultProfile(),
    order: {
      // @ts-expect-error -- "nowhere" is not a parent id of the menu
      nowhere: ["open"]
    }
  };
  resolveMenu({
    items: menu,
    profile: {
      ...defaultProfile(),
      // @ts-expect-error -- resolveMenu checks the profile against the ids of its items
      shown: ["missing"]
    }
  });
  assert.ok(hidden && order);
});

test("a field of another kind does not compile", () => {
  defineMenu([
    {
      kind: MenuItemKind.COMMAND,
      id: "a",
      label: "A",
      // @ts-expect-error -- a command has no isChecked
      isChecked: true
    },
    {
      kind: MenuItemKind.CHECK,
      id: "b",
      label: "B",
      // @ts-expect-error -- a check item has no items
      items: []
    },
    {
      kind: MenuItemKind.SEPARATOR,
      id: "c",
      // @ts-expect-error -- a separator has no label
      label: "C"
    }
  ]);
});

test("a radio item without a group does not compile", () => {
  defineMenu([
    // @ts-expect-error -- a radio item needs a group
    {
      kind: MenuItemKind.RADIO,
      id: "r",
      label: "R"
    }
  ]);
});

test("a level that does not exist does not compile", () => {
  defineMenu([
    {
      kind: MenuItemKind.COMMAND,
      id: "a",
      label: "A",
      // @ts-expect-error -- "advanced" is not a MenuLevel
      level: "advanced"
    }
  ]);
});

test("a resolved line carries final text, not a function", () => {
  const [first] = resolveMenu({
    items: [{
      kind: MenuItemKind.COMMAND,
      id: "go",
      label: () => "Go"
    }]
  });
  assert.equal(first?.kind === MenuItemKind.COMMAND && first.label, "Go");
});
