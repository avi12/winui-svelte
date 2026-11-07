import {
  editorRows,
  hasTweaks,
  isCustomized,
  isItemShown,
  MoveDirection,
  moveItem,
  setItemShown,
  setLevel
} from "./edit-profile.ts";
import { defaultProfile } from "#src/tray/menu/default-profile.js";
import { describeMenu } from "#src/tray/menu/describe.js";
import { resolveMenu } from "#src/tray/menu/resolve.js";
import { MenuItemKind, MenuLevel } from "#src/tray/menu/types.js";
import type { MenuItem } from "#src/tray/menu/types.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The editing rules the editor component calls, as plain functions on a
// profile: level, toggling, order inside a menu, the required lock, reset.

function command({ id, level = MenuLevel.SIMPLE, isRequired = false }: {
  id: string;
  level?: MenuLevel;
  isRequired?: boolean;
}) {
  return {
    kind: MenuItemKind.COMMAND,
    id,
    label: id,
    level,
    isRequired
  } satisfies MenuItem;
}

const items = [
  command({ id: "open" }),
  command({
    id: "settings",
    level: MenuLevel.STANDARD
  }),
  {
    kind: MenuItemKind.SUBMENU,
    id: "tools",
    label: "Tools",
    level: MenuLevel.STANDARD,
    items: [
      command({
        id: "ruler",
        level: MenuLevel.STANDARD
      }),
      command({
        id: "picker",
        level: MenuLevel.FULL
      })
    ]
  },
  command({
    id: "quit",
    isRequired: true
  })
] satisfies MenuItem[];

const descriptions = describeMenu({ items });

function description(id: string) {
  const found = descriptions.find(candidate => candidate.id === id);
  assert.ok(found);
  return found;
}

function shownIds(profile: ReturnType<typeof defaultProfile<string>>) {
  return editorRows({
    descriptions,
    profile
  }).filter(row => row.isShown).map(row => row.id);
}

test("the rows follow the level, and a child sits under its submenu", () => {
  assert.deepEqual(shownIds(defaultProfile()), ["open", "quit"]);
  assert.deepEqual(
    shownIds(
      setLevel({
        profile: defaultProfile(),
        level: MenuLevel.STANDARD
      })
    ), ["open", "settings", "tools", "ruler", "quit"]
  );
  const rows = editorRows({
    descriptions,
    profile: defaultProfile()
  });
  assert.deepEqual(rows.map(row => `${row.depth}:${row.id}`), ["0:open", "0:settings", "0:tools", "1:ruler", "1:picker", "0:quit"]);
});

test("the rows say what the menu really shows", () => {
  const profile = setItemShown({
    profile: setLevel({
      profile: defaultProfile(),
      level: MenuLevel.FULL
    }),
    description: description("ruler"),
    isShown: false
  });
  const shown = editorRows({
    descriptions,
    profile
  }).filter(row => row.isShown).map(row => row.id);
  const resolved = resolveMenu({
    items,
    profile
  });
  assert.deepEqual(shown, ["open", "settings", "tools", "picker", "quit"]);
  assert.deepEqual(resolved.map(entry => entry.id), ["open", "settings", "tools", "quit"]);
});

test("turning an item off below its level hides it, and turning it back leaves no entry", () => {
  const atStandard = setLevel({
    profile: defaultProfile(),
    level: MenuLevel.STANDARD
  });
  const off = setItemShown({
    profile: atStandard,
    description: description("settings"),
    isShown: false
  });
  assert.deepEqual(off.hidden, ["settings"]);
  assert.equal(
    isItemShown({
      description: description("settings"),
      profile: off
    }), false
  );
  const on = setItemShown({
    profile: off,
    description: description("settings"),
    isShown: true
  });
  assert.deepEqual(on, atStandard);
});

test("turning on an item above the level shows it through a shown entry", () => {
  const on = setItemShown({
    profile: defaultProfile(),
    description: description("settings"),
    isShown: true
  });
  assert.deepEqual(on.shown, ["settings"]);
  assert.equal(hasTweaks(on), true);
  const off = setItemShown({
    profile: on,
    description: description("settings"),
    isShown: false
  });
  assert.deepEqual(off, defaultProfile());
});

test("a required item cannot be turned off", () => {
  const profile = defaultProfile();
  assert.equal(
    setItemShown({
      profile,
      description: description("quit"),
      isShown: false
    }), profile
  );
  assert.equal(
    isItemShown({
      description: description("quit"),
      profile
    }), true
  );
});

test("a level change keeps the tweaks, and the tweaks decide over the new level", () => {
  const tweaked = setItemShown({
    profile: setItemShown({
      profile: defaultProfile(),
      description: description("settings"),
      isShown: true
    }),
    description: description("open"),
    isShown: false
  });
  const full = setLevel({
    profile: tweaked,
    level: MenuLevel.FULL
  });
  assert.deepEqual(full.shown, ["settings"]);
  assert.deepEqual(full.hidden, ["open"]);
  assert.deepEqual(shownIds(full), ["settings", "tools", "ruler", "picker", "quit"]);
  assert.equal(
    hasTweaks(
      setLevel({
        profile: defaultProfile(),
        level: MenuLevel.FULL
      })
    ), false, "the level alone is not a tweak"
  );
});

test("an item hidden at one level stays hidden at the next, and stays off if turned on above it", () => {
  const hiddenAtStandard = setItemShown({
    profile: setLevel({
      profile: defaultProfile(),
      level: MenuLevel.STANDARD
    }),
    description: description("settings"),
    isShown: false
  });
  const backToSimple = setLevel({
    profile: hiddenAtStandard,
    level: MenuLevel.SIMPLE
  });
  const turnedOn = setItemShown({
    profile: backToSimple,
    description: description("settings"),
    isShown: true
  });
  assert.deepEqual(turnedOn.hidden, []);
  assert.deepEqual(turnedOn.shown, ["settings"]);
});

test("moving an item swaps it with its neighbour inside its own menu only", () => {
  const down = moveItem({
    profile: defaultProfile(),
    descriptions,
    id: "open",
    direction: MoveDirection.DOWN
  });
  assert.deepEqual(down.order, { "": ["settings", "open", "tools", "quit"] });
  const inside = moveItem({
    profile: down,
    descriptions,
    id: "picker",
    direction: MoveDirection.UP
  });
  assert.deepEqual(inside.order, {
    "": ["settings", "open", "tools", "quit"],
    tools: ["picker", "ruler"]
  });
  const rows = editorRows({
    descriptions,
    profile: inside
  });
  assert.deepEqual(rows.map(row => row.id), ["settings", "open", "tools", "picker", "ruler", "quit"]);
  assert.deepEqual(rows.map(row => row.canMoveUp), [false, true, true, false, true, true]);
  assert.deepEqual(rows.map(row => row.canMoveDown), [true, true, true, true, false, false]);
});

test("a move at the end of a menu does nothing, and moving back drops the stored order", () => {
  const profile = defaultProfile();
  assert.equal(
    moveItem({
      profile,
      descriptions,
      id: "open",
      direction: MoveDirection.UP
    }), profile
  );
  assert.equal(
    moveItem({
      profile,
      descriptions,
      id: "quit",
      direction: MoveDirection.DOWN
    }), profile
  );
  const moved = moveItem({
    profile,
    descriptions,
    id: "open",
    direction: MoveDirection.DOWN
  });
  const back = moveItem({
    profile: moved,
    descriptions,
    id: "open",
    direction: MoveDirection.UP
  });
  assert.deepEqual(back.order, {});
  assert.equal(hasTweaks(back), false);
});

test("the resolved menu follows the order the editor stored", () => {
  const profile = moveItem({
    profile: setLevel({
      profile: defaultProfile(),
      level: MenuLevel.STANDARD
    }),
    descriptions,
    id: "quit",
    direction: MoveDirection.UP
  });
  assert.deepEqual(
    resolveMenu({
      items,
      profile
    }).map(entry => entry.id), ["open", "settings", "quit", "tools"]
  );
});

test("reset is the default profile, and a profile is customized when it differs from it", () => {
  assert.equal(isCustomized(defaultProfile()), false);
  assert.equal(
    isCustomized(
      setLevel({
        profile: defaultProfile(),
        level: MenuLevel.STANDARD
      })
    ), true
  );
  assert.equal(
    isCustomized(
      moveItem({
        profile: defaultProfile(),
        descriptions,
        id: "open",
        direction: MoveDirection.DOWN
      })
    ), true
  );
});
