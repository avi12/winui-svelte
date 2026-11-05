import { NativeMenuEntryKind } from "./native.ts";
import type { NativeMenu, NativeMenuEntry } from "./native.ts";
import { createStandaloneTray } from "./standalone-tray.ts";
import type { StandaloneMenuItem } from "./standalone-tray.ts";
import type {
  ButtonSample,
  PointerSample,
  ScreenRect,
  TrayIdentity,
  TrayNative
} from "#src/tray/native.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The tray-only icon against a fake Win32 layer and a fake popup menu: which
// entries the menu is given, what a choice runs, and what is made when.

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
    isTaskbarLight: () => false,
    workAreaAt: () => ICON_RECT,
    focusWindow: hwnd => calls.push(`focusWindow ${hwnd}`)
  };
  return {
    native,
    calls,
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

function start({ menu, choose }: {
  menu: readonly StandaloneMenuItem[] | undefined;
  choose: (entries: readonly NativeMenuEntry[]) => number;
}) {
  const fake = fakeNative();
  let tick = noop;
  const shown: Array<{
    owner: bigint;
    point: {
      x: number;
      y: number;
    };
    entries: readonly NativeMenuEntry[];
  }> = [];
  const nativeMenu: NativeMenu = {
    choose(options) {
      fake.calls.push("choose");
      shown.push(options);
      return choose(options.entries);
    }
  };
  const handle = createStandaloneTray({
    icon: "a.ico",
    menu,
    native: fake.native,
    nativeMenu,
    schedule({ onTick }) {
      tick = onTick;
      return () => {};
    }
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
    handle,
    rightClick,
    leftClick() {
      fake.press("left");
      tick();
      fake.release();
      tick();
    }
  };
}

const COMMAND = NativeMenuEntryKind.COMMAND;
const SEPARATOR = NativeMenuEntryKind.SEPARATOR;

test("a right click shows the menu at the pointer, numbering the commands from 1", () => {
  const { shown, rightClick, handle } = start({
    menu: [
      {
        kind: COMMAND,
        label: "Open",
        onselect() {}
      },
      { kind: SEPARATOR },
      {
        kind: COMMAND,
        label: "Quit",
        isEnabled: false,
        onselect() {}
      }
    ],
    choose: () => 0
  });
  rightClick();
  assert.equal(shown.length, 1);
  assert.deepEqual(shown[0]?.point, {
    x: 110,
    y: 112
  });
  assert.deepEqual(shown[0]?.entries, [
    {
      kind: COMMAND,
      id: 1,
      label: "Open",
      isEnabled: true
    },
    { kind: SEPARATOR },
    {
      kind: COMMAND,
      id: 2,
      label: "Quit",
      isEnabled: false
    }
  ]);
  handle.remove();
});

test("the chosen command runs, and only that one", () => {
  const ran: string[] = [];
  const { rightClick, handle } = start({
    menu: [
      {
        kind: COMMAND,
        label: "Open",
        onselect: () => ran.push("open")
      },
      {
        kind: COMMAND,
        label: "Quit",
        onselect: () => ran.push("quit")
      }
    ],
    choose: () => 2
  });
  rightClick();
  assert.deepEqual(ran, ["quit"]);
  handle.remove();
});

test("closing the menu with no choice runs nothing", () => {
  const ran: string[] = [];
  const { rightClick, handle } = start({
    menu: [{
      kind: COMMAND,
      label: "Open",
      onselect: () => ran.push("open")
    }],
    choose: () => 0
  });
  rightClick();
  assert.deepEqual(ran, []);
  handle.remove();
});

test("the menu's owner window exists only while the menu is open, and takes the foreground first", () => {
  const { calls, rightClick, handle } = start({
    menu: [{
      kind: COMMAND,
      label: "Open",
      onselect() {}
    }],
    choose: () => 0
  });
  assert.equal(calls.includes("createOwnerWindow"), true, "the icon's own owner window");
  const before = calls.length;
  rightClick();
  assert.deepEqual(calls.slice(before), ["createOwnerWindow", `focusWindow ${OWNER}`, "choose", `destroyWindow ${OWNER}`]);
  handle.remove();
});

test("no menu items, no popup: a right click does nothing", () => {
  const { shown, rightClick, handle } = start({
    menu: undefined,
    choose: () => 0
  });
  rightClick();
  assert.equal(shown.length, 0);
  handle.remove();
});

test("the owner window is destroyed even when a command throws", () => {
  const { calls, rightClick, handle } = start({
    menu: [{
      kind: COMMAND,
      label: "Boom",
      onselect() {
        throw new Error("boom");
      }
    }],
    choose: () => 1
  });
  assert.throws(rightClick, /boom/u);
  assert.equal(calls.at(-1), `destroyWindow ${OWNER}`);
  handle.remove();
});
