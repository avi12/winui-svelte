import type { NativeChoice, NativeMenu } from "./native.ts";
import { createStandaloneTray } from "./standalone-tray.ts";
import type { StandaloneTrayOptions } from "./standalone-tray.ts";
import { balloons } from "#src/tray/balloons.js";
import { bounds } from "#src/tray/bounds.js";
import { defaultProfile } from "#src/tray/menu/default-profile.js";
import { resolveMenu } from "#src/tray/menu/resolve.js";
import { MenuItemKind } from "#src/tray/menu/types.js";
import type { MenuItem, ResolvedMenuItem } from "#src/tray/menu/types.js";
import type {
  ButtonSample,
  PointerSample,
  ScreenRect,
  TrayIdentity,
  TrayNative
} from "#src/tray/native.js";
import { themedIcon } from "#src/tray/themed-icon.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The tray-only icon against a fake Win32 layer and a fake popup menu: which
// lines the menu is given, what a pick runs and when, and what is made when.

const OWNER = 5n;
const ICON_RECT: ScreenRect = {
  left: 100,
  top: 100,
  right: 132,
  bottom: 132
};
const RELEASED: ButtonSample = {
  isDown: false,
  wasPressed: false
};
const DOWN: ButtonSample = {
  isDown: true,
  wasPressed: true
};

function noop() {}

function fakeNative() {
  const calls: string[] = [];
  let isFocusable = true;
  let pointer: PointerSample = {
    x: 110,
    y: 112,
    left: RELEASED,
    right: RELEASED,
    middle: RELEASED,
    isOnTray: true
  };
  const native: TrayNative = {
    createOwnerWindow() {
      calls.push("createOwnerWindow");
      return OWNER;
    },
    destroyWindow: hwnd => calls.push(`destroyWindow ${hwnd}`),
    loadIcon: () => 1n,
    destroyIcon() {},
    iconSize: () => 16,
    notify: () => true,
    iconRect: (_identity: TrayIdentity) => ICON_RECT,
    readPointer: () => pointer,
    focusWindow(hwnd) {
      calls.push(`focusWindow ${hwnd}`);
      return isFocusable;
    }
  };
  return {
    native,
    calls,
    refuseFocus() {
      isFocusable = false;
    },
    press(button: "left" | "right") {
      pointer = {
        ...pointer,
        [button]: DOWN
      };
    },
    release() {
      pointer = {
        ...pointer,
        left: RELEASED,
        right: RELEASED
      };
    }
  };
}

// eslint-disable-next-line no-restricted-syntax -- a recursive function needs its return type written
function find({ items, id }: {
  readonly items: readonly ResolvedMenuItem[];
  readonly id: string;
}): NativeChoice | undefined {
  for (const item of items) {
    const isSubmenu = item.kind === MenuItemKind.SUBMENU;
    if (isSubmenu) {
      const inner = find({
        items: item.items,
        id
      });
      if (inner) {
        return inner;
      }

      continue;
    }

    const isPickable = item.kind !== MenuItemKind.SEPARATOR && item.kind !== MenuItemKind.HEADER;
    const isWanted = isPickable && item.id === id;
    if (isWanted) {
      return item;
    }
  }

  return undefined;
}

// eslint-disable-next-line no-restricted-syntax -- a recursive function needs its return type written
function names(items: readonly ResolvedMenuItem[]): string[] {
  return items.map(item => (item.kind === MenuItemKind.SUBMENU ? `${item.id}[${names(item.items).join(",")}]` : item.id));
}

function start<const ItemId extends string>({ menu, picks, profile }: {
  readonly menu: StandaloneTrayOptions<ItemId>["menu"];
  readonly picks: ReadonlyArray<string | undefined>;
  readonly profile?: NonNullable<Extract<StandaloneTrayOptions<ItemId>, { readonly resolve: unknown }>["profile"]>;
}) {
  const fake = fakeNative();
  let tick = noop;
  const shown: Array<{
    readonly owner: bigint;
    readonly point: {
      readonly x: number;
      readonly y: number;
    };
    readonly items: readonly ResolvedMenuItem[];
  }> = [];
  const deferred: Array<() => void> = [];
  const nativeMenu: NativeMenu = {
    choose(options) {
      fake.calls.push("choose");
      shown.push(options);
      const pick = picks[shown.length - 1];
      return pick === undefined ? undefined : find({
        items: options.items,
        id: pick
      });
    }
  };
  const seams = {
    native: fake.native,
    nativeMenu,
    defer: (run: () => void) => deferred.push(run),
    schedule({ onTick }: { readonly onTick: () => void }) {
      tick = onTick;
      return () => {};
    }
  };
  const handle = profile ? createStandaloneTray({
    icon: "a.ico",
    menu,
    resolve: resolveMenu,
    profile,
    ...seams
  }) : createStandaloneTray({
    icon: "a.ico",
    menu,
    ...seams
  });
  function rightClick() {
    fake.press("right");
    tick();
    fake.release();
    tick();
  }
  return {
    ...fake,
    shown,
    deferred,
    handle,
    rightClick
  };
}

function command<const ItemId extends string>({ id, onselect = noop }: {
  readonly id: ItemId;
  readonly onselect?: () => void;
}) {
  return {
    kind: MenuItemKind.COMMAND,
    id,
    label: id,
    onselect
  } satisfies MenuItem;
}

test("a right click shows the resolved menu at the pointer", () => {
  const { shown, rightClick, handle } = start({
    menu: [
      command({ id: "open" }),
      {
        kind: MenuItemKind.SEPARATOR,
        id: "line"
      },
      {
        kind: MenuItemKind.COMMAND,
        id: "quit",
        label: "Quit",
        isEnabled: false
      }
    ],
    picks: [undefined]
  });
  rightClick();
  assert.equal(shown.length, 1);
  assert.deepEqual(shown[0]?.point, {
    x: 110,
    y: 112
  });
  assert.deepEqual(names(shown[0]?.items ?? []), ["open", "line", "quit"]);
  const quit = shown[0]?.items[2];
  assert.equal(quit?.kind === MenuItemKind.COMMAND && quit.isEnabled, false);
  handle.remove();
});

test("a menu given as a function is read each time the menu opens", () => {
  let currentIds = ["one"];
  const { shown, rightClick, handle } = start({
    menu: () => currentIds.map(id => command({ id })),
    picks: [undefined, undefined]
  });
  rightClick();
  currentIds = ["one", "two"];
  rightClick();
  assert.deepEqual(shown.map(entry => names(entry.items)), [["one"], ["one", "two"]]);
  handle.remove();
});

test("the chosen command runs on a later turn, and only that one", () => {
  const ran: string[] = [];
  const { rightClick, deferred, handle } = start({
    menu: [command({
      id: "open",
      onselect: () => ran.push("open")
    }), command({
      id: "quit",
      onselect: () => ran.push("quit")
    })],
    picks: ["quit"]
  });
  rightClick();
  assert.deepEqual(ran, [], "not while the menu is closing");
  for (const run of deferred) {
    run();
  }

  assert.deepEqual(ran, ["quit"]);
  handle.remove();
});

test("a command with closeThenRun false runs at once, after the menu is gone", () => {
  const calls: string[] = [];
  const { rightClick, handle, calls: fakeCalls } = start({
    menu: [{
      kind: MenuItemKind.COMMAND,
      id: "now",
      label: "Now",
      closeThenRun: false,
      onselect: () => calls.push("ran")
    }],
    picks: ["now"]
  });
  rightClick();
  assert.deepEqual(calls, ["ran"]);
  assert.equal(fakeCalls.at(-1), `destroyWindow ${OWNER}`);
  handle.remove();
});

test("closing the menu with no choice runs nothing", () => {
  const ran: string[] = [];
  const { rightClick, deferred, handle } = start({
    menu: [command({
      id: "open",
      onselect: () => ran.push("open")
    })],
    picks: [undefined]
  });
  rightClick();
  assert.deepEqual([ran, deferred.length], [[], 0]);
  handle.remove();
});

test("the owner window exists only while the menu is open, and takes the foreground first", () => {
  const { calls, rightClick, handle } = start({
    menu: [command({ id: "open" })],
    picks: [undefined]
  });
  assert.equal(calls.includes("createOwnerWindow"), true, "the icon's own owner window");
  const before = calls.length;
  rightClick();
  assert.deepEqual(calls.slice(before), ["createOwnerWindow", `focusWindow ${OWNER}`, "choose", `destroyWindow ${OWNER}`]);
  handle.remove();
});

test("a menu whose owner cannot take the foreground is not opened, so the thread is never held by it", () => {
  const { calls, shown, refuseFocus, rightClick, handle } = start({
    menu: [command({ id: "open" })],
    picks: ["open"]
  });
  refuseFocus();
  const before = calls.length;
  rightClick();
  assert.equal(shown.length, 0, "a menu that a click elsewhere cannot dismiss would block the process until a pick");
  assert.deepEqual(calls.slice(before), [
    "createOwnerWindow",
    `focusWindow ${OWNER}`,
    `focusWindow ${OWNER}`,
    `focusWindow ${OWNER}`,
    `destroyWindow ${OWNER}`
  ]);
  handle.remove();
});

test("no menu items, no popup: a right click does nothing", () => {
  const { shown, rightClick, handle } = start({
    menu: undefined,
    picks: []
  });
  rightClick();
  assert.equal(shown.length, 0);
  handle.remove();
});

test("the owner window is destroyed even when a stay-open command throws", () => {
  const { calls, rightClick, handle } = start({
    menu: [{
      kind: MenuItemKind.COMMAND,
      id: "boom",
      label: "Boom",
      staysOpen: true,
      onselect() {
        throw new Error("boom");
      }
    }],
    picks: ["boom"]
  });
  assert.throws(rightClick, /boom/u);
  assert.equal(calls.at(-1), `destroyWindow ${OWNER}`);
  handle.remove();
});

test("a stay-open check runs, then the menu reopens at the same point with the new tick", () => {
  let isOn = false;
  const { shown, rightClick, deferred, handle } = start({
    menu: [{
      kind: MenuItemKind.CHECK,
      id: "mute",
      label: "Mute",
      staysOpen: true,
      isChecked: () => isOn,
      onselect() {
        isOn = !isOn;
      }
    }, command({ id: "quit" })],
    picks: ["mute", "mute", undefined]
  });
  rightClick();
  assert.equal(shown.length, 3);
  assert.deepEqual(shown.map(({ point }) => point), [shown[0]?.point, shown[0]?.point, shown[0]?.point]);
  const ticks = shown.map(({ items }) => {
    const [first] = items;
    return first?.kind === MenuItemKind.CHECK && first.isChecked;
  });
  assert.deepEqual(ticks, [false, true, false]);
  assert.equal(deferred.length, 0);
  handle.remove();
});

test("submenus reach the popup with their children, lazy ones made when the menu opens", () => {
  let count = 0;
  const { shown, rightClick, handle } = start({
    menu: [{
      kind: MenuItemKind.SUBMENU,
      id: "recent",
      label: "Recent",
      items() {
        count += 1;
        return [command({ id: "first" })];
      }
    }],
    picks: [undefined, undefined]
  });
  assert.equal(count, 0, "nothing exists while idle");
  rightClick();
  rightClick();
  assert.equal(count, 2);
  assert.deepEqual(names(shown[1]?.items ?? []), ["recent[first]"]);
  handle.remove();
});

test("the profile, or a function that gives it, decides what shows each time", () => {
  let hidden: ReadonlyArray<"open" | "quit"> = ["open"];
  const { shown, rightClick, handle } = start({
    menu: [command({ id: "open" }), command({ id: "quit" })],
    picks: [undefined, undefined],
    profile: () => ({
      ...defaultProfile<"open" | "quit">(),
      hidden
    })
  });
  rightClick();
  hidden = [];
  rightClick();
  assert.deepEqual(shown.map(({ items }) => names(items)), [["quit"], ["open", "quit"]]);
  handle.remove();
});

test("a profile with an id that is not in the menu, or a line of the wrong shape, does not compile", () => {
  const { native } = fakeNative();
  function schedule() {
    return noop;
  }

  createStandaloneTray({
    icon: "a.ico",
    menu: [command({ id: "open" })],
    profile: {
      ...defaultProfile(),
      // @ts-expect-error "nope" is not an id of the menu
      hidden: ["nope"]
    },
    native,
    schedule
  }).remove();
  // @ts-expect-error a profile without the full resolver would be ignored
  createStandaloneTray({
    icon: "a.ico",
    menu: [command({ id: "open" })],
    profile: defaultProfile(),
    native,
    schedule
  }).remove();
  createStandaloneTray({
    icon: "a.ico",
    menu: [command({ id: "open" })],
    resolve: resolveMenu,
    profile: defaultProfile(),
    native,
    schedule
  }).remove();
  createStandaloneTray({
    icon: "a.ico",
    menu: [{
      kind: MenuItemKind.COMMAND,
      id: "open",
      label: "Open",
      // @ts-expect-error a command has no group
      group: "a"
    }],
    native,
    schedule
  }).remove();
  createStandaloneTray({
    icon: "a.ico",
    // @ts-expect-error a separator needs an id like every line
    menu: [{ kind: MenuItemKind.SEPARATOR }],
    native,
    schedule
  }).remove();
});

test("notify and bounds exist on the handle only with their extras, and a themed icon only with its extra", () => {
  const { native } = fakeNative();
  function schedule() {
    return noop;
  }

  const plain = createStandaloneTray({
    icon: "a.ico",
    native,
    schedule
  });
  function usePlain() {
    // @ts-expect-error notify needs the balloons extra
    plain.notify({ title: "x" });
    // @ts-expect-error bounds needs the bounds extra
    plain.bounds();
  }

  assert.equal("notify" in plain, false);
  assert.equal("bounds" in plain, false);
  assert.equal(typeof usePlain, "function");
  plain.remove();
  createStandaloneTray({
    // @ts-expect-error a light and dark pair needs the themedIcon extra
    icon: {
      forLightTaskbar: "dark.ico",
      forDarkTaskbar: "light.ico"
    },
    native,
    schedule
  }).remove();
  const full = createStandaloneTray({
    icon: {
      forLightTaskbar: "dark.ico",
      forDarkTaskbar: "light.ico"
    },
    extras: [balloons, bounds, themedIcon],
    native,
    schedule
  });
  full.notify({ title: "x" });
  assert.deepEqual(full.bounds(), ICON_RECT);
  full.remove();
});
