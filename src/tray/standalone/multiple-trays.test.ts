import type { MenuTheme } from "./menu-theme.ts";
import { MenuColorScheme } from "./menu-theme.ts";
import type { NativeMenu } from "./native.ts";
import { createStandaloneTray } from "./standalone-tray.ts";
import { MenuItemKind } from "#src/tray/menu/types.js";
import type { MenuItem } from "#src/tray/menu/types.js";
import type {
  ButtonSample,
  NotifyOperation,
  ScreenRect,
  TrayIdentity,
  TrayNative
} from "#src/tray/native.js";
import { NotifyOperation as Operation } from "#src/tray/native.js";
import { removeAllTrayIcons } from "#src/tray/tray-core.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// Several standalone trays in one process, each against a fake Win32 layer of
// its own but one shared pointer and one shared log, as the real process has:
// which tray hears a click, whose menu opens under which color scheme, and
// what leaving one does to the others.

const FIRST_RECT: ScreenRect = {
  left: 100,
  top: 100,
  right: 132,
  bottom: 132
};
const SECOND_RECT: ScreenRect = {
  left: 140,
  top: 100,
  right: 172,
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

const log: string[] = [];
const world = {
  x: 0,
  right: RELEASED
};

function pointer() {
  return {
    x: world.x,
    y: 110,
    left: RELEASED,
    right: world.right,
    middle: RELEASED,
    isOnTray: true
  };
}

function rightClickAt({ x, ticks }: {
  readonly x: number;
  readonly ticks: ReadonlyArray<() => void>;
}) {
  world.x = x;
  world.right = DOWN;
  for (const tick of ticks) {
    tick();
  }

  world.right = RELEASED;
  for (const tick of ticks) {
    tick();
  }
}

let nextOwner = 1000n;

function noop() {}

function fakeTray({ name, rect, scheme, items }: {
  readonly name: string;
  readonly rect: ScreenRect;
  readonly scheme: MenuColorScheme;
  readonly items: () => ReadonlyArray<MenuItem<string>>;
}) {
  const notified: Array<{
    readonly operation: NotifyOperation;
    readonly identity: TrayIdentity;
  }> = [];
  let tick = noop;
  let isTimerRunning = false;
  const owner = nextOwner++;
  const native: TrayNative = {
    createOwnerWindow: () => owner,
    destroyWindow: hwnd => log.push(`${name} destroyWindow ${hwnd}`),
    loadIcon: () => 1n,
    destroyIcon: noop,
    iconSize: () => 16,
    notify({ operation, data }) {
      notified.push({
        operation,
        identity: data.identity
      });
      return true;
    },
    iconRect: () => rect,
    readPointer: pointer,
    focusWindow: () => true
  };
  const nativeMenu: NativeMenu = {
    choose({ items: shown }) {
      log.push(`${name} choose ${shown.map(item => item.id).join(",")}`);
      return undefined;
    }
  };
  const menuTheme: MenuTheme = {
    apply: applied => log.push(`${name} theme ${applied}`)
  };
  const handle = createStandaloneTray({
    icon: `${name}.ico`,
    colorScheme: scheme,
    menu: items,
    native,
    nativeMenu,
    menuTheme,
    defer: noop,
    schedule({ onTick }) {
      tick = onTick;
      isTimerRunning = true;
      return () => {
        isTimerRunning = false;
      };
    }
  });
  return {
    handle,
    notified,
    tick: () => tick(),
    isTimerRunning: () => isTimerRunning
  };
}

function lines(...ids: string[]) {
  return () => ids.map(id => ({
    kind: MenuItemKind.COMMAND,
    id,
    label: id,
    onselect: noop
  }) satisfies MenuItem);
}

function startPair() {
  log.length = 0;
  const first = fakeTray({
    name: "first",
    rect: FIRST_RECT,
    scheme: MenuColorScheme.DARK,
    items: lines("a1", "a2")
  });
  const second = fakeTray({
    name: "second",
    rect: SECOND_RECT,
    scheme: MenuColorScheme.LIGHT,
    items: lines("b1")
  });
  return {
    first,
    second,
    ticks: [first.tick, second.tick]
  };
}

test("each tray has an icon identity of its own", () => {
  const { first, second } = startPair();
  const [firstAdd] = first.notified;
  const [secondAdd] = second.notified;
  assert.equal(firstAdd?.operation, Operation.add);
  assert.equal(secondAdd?.operation, Operation.add);
  assert.notEqual(firstAdd?.identity.id, secondAdd?.identity.id);
  assert.notEqual(firstAdd?.identity.owner, secondAdd?.identity.owner);
  first.handle.remove();
  second.handle.remove();
});

test("a right click over one icon opens that tray's menu only", () => {
  const { first, second, ticks } = startPair();
  rightClickAt({
    x: 110,
    ticks
  });
  assert.deepEqual(log.filter(line => line.includes("choose")), ["first choose a1,a2"]);
  log.length = 0;
  rightClickAt({
    x: 150,
    ticks
  });
  assert.deepEqual(log.filter(line => line.includes("choose")), ["second choose b1"]);
  first.handle.remove();
  second.handle.remove();
});

test("each menu opens under its own tray's color scheme, set right before it", () => {
  const { first, second, ticks } = startPair();
  rightClickAt({
    x: 110,
    ticks
  });
  rightClickAt({
    x: 150,
    ticks
  });
  rightClickAt({
    x: 110,
    ticks
  });
  const order = log.filter(line => /theme|choose/u.test(line));
  assert.deepEqual(order, [
    "first theme dark",
    "first choose a1,a2",
    "second theme light",
    "second choose b1",
    "first theme dark",
    "first choose a1,a2"
  ]);
  first.handle.remove();
  second.handle.remove();
});

test("a menu given as a function is read by its own tray, when its own menu opens", () => {
  let firstReads = 0;
  let secondReads = 0;
  log.length = 0;
  const first = fakeTray({
    name: "first",
    rect: FIRST_RECT,
    scheme: MenuColorScheme.SYSTEM,
    items() {
      firstReads++;
      return lines("a1")();
    }
  });
  const second = fakeTray({
    name: "second",
    rect: SECOND_RECT,
    scheme: MenuColorScheme.SYSTEM,
    items() {
      secondReads++;
      return lines("b1")();
    }
  });
  rightClickAt({
    x: 150,
    ticks: [first.tick, second.tick]
  });
  assert.deepEqual([firstReads, secondReads], [0, 1]);
  first.handle.remove();
  second.handle.remove();
});

test("removing one tray stops its timer and its icon only", () => {
  const { first, second } = startPair();
  first.handle.remove();
  assert.equal(first.isTimerRunning(), false);
  assert.equal(second.isTimerRunning(), true);
  assert.equal(first.notified.at(-1)?.operation, Operation.remove);
  assert.notEqual(second.notified.at(-1)?.operation, Operation.remove);
  second.handle.remove();
});

test("the exit cleanup removes every tray's icon", () => {
  const { first, second } = startPair();
  removeAllTrayIcons();
  assert.equal(first.notified.at(-1)?.operation, Operation.remove);
  assert.equal(second.notified.at(-1)?.operation, Operation.remove);
  assert.equal(first.isTimerRunning() || second.isTimerRunning(), false);
});
