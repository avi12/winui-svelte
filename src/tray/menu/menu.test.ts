import {
  defaultProfile,
  describeMenu,
  MenuItemKind,
  MenuLevel,
  MenuModelError,
  parseProfile,
  resolveMenu
} from "./index.ts";
import type { MenuItem, MenuProfile, ResolvedMenuItem } from "./index.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

function command({ id, ...extra }: {
  id: string;
  level?: MenuLevel;
  isRequired?: boolean;
}) {
  return {
    kind: MenuItemKind.COMMAND,
    id,
    label: id,
    ...extra
  } satisfies MenuItem;
}

function separator(id: string) {
  return {
    kind: MenuItemKind.SEPARATOR,
    id
  } satisfies MenuItem;
}

// eslint-disable-next-line no-restricted-syntax -- a recursive function needs its return type written
function shape(entries: readonly ResolvedMenuItem[]): string[] {
  const names = entries.map(entry => (entry.kind === MenuItemKind.SUBMENU ? `${entry.id}[${shape(entry.items).join(",")}]` : entry.id));
  return names;
}

function profile(extra: Partial<MenuProfile> = {}) {
  return {
    ...defaultProfile(),
    ...extra
  };
}

const ANY_STT = [command({ id: "toggle" }), command({ id: "settings" }), separator("sep"), command({ id: "quit" })];

const recent = ["a", "b", "c"];
const SHAREX = [
  {
    kind: MenuItemKind.HEADER,
    id: "head",
    label: "Capture"
  },
  {
    kind: MenuItemKind.SUBMENU,
    id: "capture",
    label: "Capture",
    items: [command({ id: "region" }), command({
      id: "window",
      level: MenuLevel.STANDARD
    }), command({
      id: "scroll",
      level: MenuLevel.FULL
    })]
  },
  {
    kind: MenuItemKind.COMMAND,
    id: "upload",
    label: "Upload",
    shortcut: "Ctrl+Shift+U",
    level: MenuLevel.STANDARD
  },
  {
    kind: MenuItemKind.SUBMENU,
    id: "tools",
    label: "Tools",
    level: MenuLevel.FULL,
    emptyLabel: "Nothing recent",
    maxItems: 2,
    sort: (left, right) => right.id.localeCompare(left.id),
    items: () => recent.map(id => command({
      id,
      level: MenuLevel.FULL
    }))
  },
  separator("sep1"),
  {
    kind: MenuItemKind.CHECK,
    id: "autostart",
    label: "Start with Windows",
    isChecked: () => true,
    level: MenuLevel.STANDARD
  },
  separator("sep2"),
  command({
    id: "quit",
    isRequired: true
  })
] satisfies MenuItem[];

test("any-stt style: no levels set shows everything", () => {
  assert.deepEqual(shape(resolveMenu({ items: ANY_STT })), ["toggle", "settings", "sep", "quit"]);
});

test("levels widen the menu and tidy separators and headers", () => {
  function shapeAt(level: MenuLevel) {
    return shape(
      resolveMenu({
        items: SHAREX,
        profile: profile({ level })
      })
    );
  }

  assert.deepEqual(shapeAt(MenuLevel.SIMPLE), ["head", "capture[region]", "sep1", "quit"]);
  assert.deepEqual(shapeAt(MenuLevel.STANDARD), ["head", "capture[region,window]", "upload", "sep1", "autostart", "sep2", "quit"]);
  assert.deepEqual(shapeAt(MenuLevel.FULL), [
    "head", "capture[region,window,scroll]", "upload", "tools[c,b]", "sep1", "autostart", "sep2", "quit"
  ]);
});

test("hidden and shown tweak single items, required cannot be hidden", () => {
  const result = resolveMenu({
    items: SHAREX,
    profile: profile({
      hidden: ["region", "quit"],
      shown: ["upload"]
    })
  });
  assert.deepEqual(shape(result), ["head", "upload", "sep1", "quit"]);
});

test("order applies per parent, unknown ids are ignored, new items go last", () => {
  const result = resolveMenu({
    items: ANY_STT,
    profile: profile({
      order: {
        "": ["quit", "ghost", "toggle"]
      }
    })
  });
  assert.deepEqual(shape(result), ["quit", "toggle", "settings"]);
});

test("a submenu with nothing left is dropped, or shows its empty label", () => {
  const dropped = resolveMenu({
    items: [command({ id: "a" }), {
      kind: MenuItemKind.SUBMENU,
      id: "s",
      label: "S",
      items: () => []
    }]
  });
  assert.deepEqual(shape(dropped), ["a"]);
  const placeholder = resolveMenu({
    items: [{
      kind: MenuItemKind.SUBMENU,
      id: "s",
      label: "S",
      emptyLabel: "None",
      items: () => []
    }]
  });
  const [submenu] = placeholder;
  assert.equal(submenu?.kind, MenuItemKind.SUBMENU);
  assert.deepEqual(submenu?.kind === MenuItemKind.SUBMENU && submenu.items.map(entry => entry.id), ["s.empty"]);
});

test("separators at the edge of an emptied submenu go", () => {
  const result = resolveMenu({
    items: [{
      kind: MenuItemKind.SUBMENU,
      id: "s",
      label: "S",
      items: [separator("x"), command({
        id: "hid",
        level: MenuLevel.FULL
      }), separator("y"), command({ id: "shown" })]
    }]
  });
  assert.deepEqual(shape(result), ["s[shown]"]);
});

test("function values are read at each resolve", () => {
  let isOn = false;
  const items = [{
    kind: MenuItemKind.CHECK,
    id: "c",
    label: () => (isOn ? "On" : "Off"),
    isChecked: () => isOn,
    isVisible: () => isOn
  }] satisfies MenuItem[];
  assert.deepEqual(resolveMenu({ items }), []);
  isOn = true;
  const [entry] = resolveMenu({ items });
  assert.equal(entry?.kind === MenuItemKind.CHECK && entry.isChecked, true);
  assert.equal(entry?.kind === MenuItemKind.CHECK && entry.label, "On");
});

test("onselect gets the declared item and closeThenRun defaults to true", () => {
  const picked: string[] = [];
  const [entry] = resolveMenu({
    items: [{
      kind: MenuItemKind.COMMAND,
      id: "go",
      label: "Go",
      onselect: ({ item }) => picked.push(item.id)
    }]
  });
  assert.ok(entry !== undefined && "select" in entry);
  entry.select();
  assert.deepEqual(picked, ["go"]);
  assert.equal(entry.closeThenRun, true);
});

test("duplicate ids and ungrouped radios are rejected", () => {
  assert.throws(() => resolveMenu({ items: [command({ id: "a" }), command({ id: "a" })] }), MenuModelError);
  assert.throws(() => resolveMenu({
    items: [{
      kind: MenuItemKind.SUBMENU,
      id: "s",
      label: "S",
      items: [command({ id: "a" })]
    }, command({ id: "a" })]
  }), /more than once/u);
  assert.throws(() => describeMenu({
    items: [{
      kind: MenuItemKind.RADIO,
      id: "r",
      label: "R",
      group: ""
    }]
  }), /group/u);
});

test("a bad profile falls back field by field instead of throwing", () => {
  assert.deepEqual(parseProfile({ value: "nonsense" }), defaultProfile());
  assert.deepEqual(
    parseProfile({
      value: {
        level: "huge",
        hidden: ["a"],
        shown: 4,
        order: {
          "": ["x"]
        }
      }
    }), {
      level: MenuLevel.SIMPLE,
      hidden: ["a"],
      shown: [],
      order: {
        "": ["x"]
      }
    }
  );
});

test("describeMenu lists every item with its parent", () => {
  const rows = describeMenu({ items: SHAREX });
  const quit = rows.find(row => row.id === "quit");
  assert.deepEqual(quit, {
    id: "quit",
    kind: MenuItemKind.COMMAND,
    label: "quit",
    level: MenuLevel.SIMPLE,
    parentId: "",
    isRequired: true
  });
  assert.equal(rows.find(row => row.id === "window")?.parentId, "capture");
  assert.equal(rows.find(row => row.id === "window")?.level, MenuLevel.STANDARD);
});
