import { balloons } from "./balloons.ts";
import { bounds } from "./bounds.ts";
import type {
  ButtonSample,
  NotifyData,
  NotifyOperation,
  PointerSample,
  ScreenRect,
  TrayIdentity,
  TrayMessage,
  TrayNative
} from "./native.ts";
import { BalloonIcon, NotifyOperation as Operation } from "./native.ts";
import { createTrayCore, removeAllTrayIcons } from "./tray-core.ts";
import type { TrayIconOptions } from "./tray-core.ts";
import type { ThemedIconExtra } from "./tray-extras.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The tray against a fake Win32 layer: no shell, no input. The fake records
// every call and answers from fields a test sets.

const OWNER = 77n;
const ICON_RECT: ScreenRect = {
  left: 100,
  top: 100,
  right: 132,
  bottom: 132
};
const MAINTENANCE_TICKS = 33;
const RELEASED: ButtonSample = {
  isDown: false,
  wasPressed: false
};
const DOWN: ButtonSample = {
  isDown: true,
  wasPressed: true
};

class FakeNative implements TrayNative {
  readonly calls: string[] = [];
  readonly notifications: {
    operation: NotifyOperation;
    data: NotifyData;
  }[] = [];
  rect: ScreenRect | null = ICON_RECT;
  isLight = false;
  size = 16;
  isShellAlive = true;
  pointer: PointerSample = {
    x: 0,
    y: 0,
    left: RELEASED,
    right: RELEASED,
    middle: RELEASED,
    isOnTray: false
  };
  messages: TrayMessage[] = [];
  isReceivingMessages = false;
  private nextIcon = 1n;

  readMessages(owner: bigint) {
    this.calls.push(`readMessages ${owner}`);
    const taken = this.messages;
    this.messages = [];
    return taken;
  }

  createOwnerWindow() {
    this.calls.push("createOwnerWindow");
    return OWNER;
  }

  destroyWindow(hwnd: bigint) {
    this.calls.push(`destroyWindow ${hwnd}`);
  }

  loadIcon({ path, size }: {
    path: string;
    size: number;
  }) {
    this.calls.push(`loadIcon ${path} ${size}`);
    return this.nextIcon++;
  }

  destroyIcon(icon: bigint) {
    this.calls.push(`destroyIcon ${icon}`);
  }

  iconSize() {
    return this.size;
  }

  notify({ operation, data }: {
    operation: NotifyOperation;
    data: NotifyData;
  }) {
    this.notifications.push({
      operation,
      data
    });
    const isAdd = operation === Operation.add;
    if (isAdd) {
      this.rect = ICON_RECT;
    }

    return this.isShellAlive || isAdd;
  }

  iconRect(_identity: TrayIdentity) {
    return this.rect;
  }

  readPointer() {
    return this.pointer;
  }

  focusWindow(hwnd: bigint) {
    this.calls.push(`focusWindow ${hwnd}`);
    return true;
  }

  allowForeground() {
    this.calls.push("allowForeground");
  }

  operations() {
    return this.notifications.map(({ operation }) => operation);
  }
}

function noop() {}

function start(options: Partial<TrayIconOptions> = {}) {
  const native = new FakeNative();
  const themedIcon: ThemedIconExtra = {
    kind: "themedIcon",
    createReader: () => () => native.isLight
  };
  let tick = noop;
  let isStopped = false;
  const intervals: number[] = [];
  let stops = 0;
  const handle = createTrayCore({
    icon: "a.ico",
    ...options,
    extras: [balloons, bounds, themedIcon],
    native,
    now: () => 0,
    schedule({ onTick, milliseconds }) {
      tick = onTick;
      intervals.push(milliseconds);
      return () => {
        isStopped = true;
        stops += 1;
      };
    }
  });
  return {
    native,
    handle,
    tick: () => tick(),
    isStopped: () => isStopped,
    intervals,
    stops: () => stops
  };
}

test("a visible icon is added, then moved to version 4, with its tooltip", () => {
  const { native, handle } = start({ tooltip: "Hello" });
  assert.deepEqual(native.operations(), [Operation.add, Operation.setVersion]);
  assert.equal(native.notifications[0]?.data.tooltip, "Hello");
  assert.equal(handle.isRegistered, true);
  assert.deepEqual(handle.bounds(), ICON_RECT);
  handle.remove();
});

test("an icon that starts hidden is not added until it is shown", () => {
  const { native, handle } = start({ isVisible: false });
  assert.deepEqual(native.notifications, []);
  handle.update({ isVisible: true });
  assert.deepEqual(native.operations(), [Operation.add, Operation.setVersion]);
  handle.update({ isVisible: false });
  assert.equal(native.operations().at(-1), Operation.remove);
  assert.equal(handle.isRegistered, false);
  handle.remove();
});

test("update changes the tooltip in place and swaps the icon without leaking the old one", () => {
  const { native, handle } = start();
  handle.update({ tooltip: "Second" });
  assert.equal(native.operations().at(-1), Operation.modify);
  assert.equal(native.notifications.at(-1)?.data.tooltip, "Second");
  handle.update({ icon: "b.ico" });
  assert.deepEqual(native.calls.filter(call => call.startsWith("loadIcon")), ["loadIcon a.ico 16", "loadIcon b.ico 16"]);
  assert.ok(native.calls.includes("destroyIcon 1"), "the replaced icon is freed");
  handle.remove();
});

test("a balloon is a modify with the info text, and a later update carries none", () => {
  const { native, handle } = start();
  handle.notify({
    title: "Done",
    body: "All saved",
    icon: "warning"
  });
  assert.deepEqual(native.notifications.at(-1)?.data.balloon, {
    title: "Done",
    body: "All saved",
    icon: BalloonIcon.warning,
    isSilent: false
  });
  handle.update({ tooltip: "Again" });
  assert.equal(native.notifications.at(-1)?.data.balloon, null);
  handle.remove();
});

test("remove deletes the icon once, frees the icon and the window, and stops the timer", () => {
  const { native, handle, isStopped } = start();
  handle.remove();
  handle.remove();
  assert.equal(native.operations().filter(operation => operation === Operation.remove).length, 1);
  assert.ok(native.calls.includes("destroyIcon 1"));
  assert.ok(native.calls.includes(`destroyWindow ${OWNER}`));
  assert.equal(isStopped(), true);
});

test("removeAllTrayIcons removes every live icon, so none is left behind at exit", () => {
  const first = start();
  const second = start();
  removeAllTrayIcons();
  assert.equal(first.native.operations().at(-1), Operation.remove);
  assert.equal(second.native.operations().at(-1), Operation.remove);
});

test("a click over the icon reaches onclick with the pointer's coordinates", () => {
  const clicks: {
    x: number;
    y: number;
  }[] = [];
  const { native, tick, handle } = start({
    onclick: ({ x, y }) => clicks.push({
      x,
      y
    })
  });
  native.pointer = {
    ...native.pointer,
    x: 110,
    y: 112,
    left: DOWN,
    isOnTray: true
  };
  tick();
  native.pointer = {
    ...native.pointer,
    left: RELEASED
  };
  tick();
  assert.deepEqual(clicks, [{
    x: 110,
    y: 112
  }]);
  handle.remove();
});

test("a click lets the process it starts take the foreground, before onclick runs", () => {
  const { native, tick, handle } = start({ onclick: () => native.calls.push("onclick") });
  native.pointer = {
    ...native.pointer,
    x: 110,
    y: 112,
    left: DOWN,
    isOnTray: true
  };
  tick();
  native.pointer = {
    ...native.pointer,
    left: RELEASED
  };
  tick();
  const iClick = native.calls.indexOf("onclick");
  assert.deepEqual(native.calls.slice(iClick - 1, iClick + 1), ["allowForeground", "onclick"]);
  handle.remove();
});

test("the pointer is read slowly away from the tray and fast over it, one timer at a time", () => {
  const { native, tick, handle, intervals, stops } = start();
  assert.deepEqual(intervals, [250]);
  tick();
  assert.deepEqual(intervals, [250], "away from the tray the pace stays");
  native.pointer = {
    ...native.pointer,
    isOnTray: true
  };
  tick();
  assert.deepEqual(intervals, [250, 30]);
  assert.equal(stops(), 1, "the slow timer was stopped");
  tick();
  assert.deepEqual(intervals, [250, 30], "over the tray the pace stays");
  native.pointer = {
    ...native.pointer,
    isOnTray: false
  };
  tick();
  assert.deepEqual(intervals, [250, 30, 250]);
  assert.equal(stops(), 2);
  handle.remove();
  assert.equal(stops(), 3, "remove stops the timer in use");
});

test("a hidden icon does not read the pointer: its timer runs only while it is shown", () => {
  const { handle, intervals, stops } = start({ isVisible: false });
  assert.deepEqual(intervals, [], "no timer for an icon that starts hidden");
  handle.update({ isVisible: true });
  assert.deepEqual(intervals, [250]);
  handle.update({ isVisible: false });
  assert.equal(stops(), 1, "hiding stops the timer");
  handle.remove();
  assert.equal(stops(), 1, "and remove has none left to stop");
});

test("a click away from the tray is not asked for the icon's place and is ignored", () => {
  const clicks: number[] = [];
  const { native, tick, handle } = start({ onclick: () => clicks.push(1) });
  native.pointer = {
    ...native.pointer,
    x: 110,
    y: 112,
    left: DOWN,
    isOnTray: false
  };
  tick();
  native.pointer = {
    ...native.pointer,
    left: RELEASED
  };
  tick();
  assert.deepEqual(clicks, []);
  handle.remove();
});

test("when the shell restarts the icon is added again", () => {
  const { native, tick, handle } = start();
  native.rect = null;
  native.isShellAlive = false;
  for (let i = 0; i < MAINTENANCE_TICKS; i++) {
    tick();
  }

  const adds = native.operations().filter(operation => operation === Operation.add);
  assert.equal(adds.length, 2, "added at the start and again after the shell lost it");
  assert.equal(handle.isRegistered, true);
  handle.remove();
});

test("a themed icon is swapped when the taskbar theme changes, and any icon when the size does", () => {
  const { native, tick, handle } = start({
    icon: {
      forLightTaskbar: "dark-glyph.ico",
      forDarkTaskbar: "light-glyph.ico"
    }
  });
  assert.ok(native.calls.includes("loadIcon light-glyph.ico 16"), "a dark taskbar gets the light glyph");
  native.isLight = true;
  for (let i = 0; i < MAINTENANCE_TICKS; i++) {
    tick();
  }

  assert.ok(native.calls.includes("loadIcon dark-glyph.ico 16"));
  native.size = 32;
  for (let i = 0; i < MAINTENANCE_TICKS; i++) {
    tick();
  }

  assert.ok(native.calls.includes("loadIcon dark-glyph.ico 32"), "a higher DPI loads a bigger icon");
  handle.remove();
});

test("a GUID is passed through, and a malformed one is refused", () => {
  const guid = "12345678-1234-1234-1234-123456789abc";
  const { native, handle } = start({ guid });
  assert.equal(native.notifications[0]?.data.identity.guid, guid);
  handle.remove();
  assert.throws(() => start({ guid: "not-a-guid" }), /GUID/u);
});

test("Enter or Space on the focused icon reaches ondoubleclick, one tick after the shell posted it", () => {
  const events: string[] = [];
  const { native, tick, handle } = start({ ondoubleclick: ({ gesture }) => events.push(gesture) });
  native.messages = [{
    notification: 0x401,
    x: 10,
    y: 20
  }];
  tick();
  assert.deepEqual(events, []);
  tick();
  assert.deepEqual(events, ["doubleClick"]);
  handle.remove();
});

test("the context-menu key reaches oncontextmenu with the anchor the shell gave", () => {
  const anchors: {
    x: number;
    y: number;
  }[] = [];
  const { native, tick, handle } = start({
    oncontextmenu: ({ x, y }) => anchors.push({
      x,
      y
    })
  });
  native.messages = [{
    notification: 0x7b,
    x: -30,
    y: 40
  }];
  tick();
  tick();
  assert.deepEqual(anchors, [{
    x: -30,
    y: 40
  }]);
  handle.remove();
});

test("a mouse click is not reported twice when the shell also posts its message", () => {
  const clicks: string[] = [];
  const { native, tick, handle } = start({ onclick: ({ gesture }) => clicks.push(gesture) });
  native.pointer = {
    ...native.pointer,
    x: 110,
    y: 112,
    left: DOWN,
    isOnTray: true
  };
  tick();
  native.pointer = {
    ...native.pointer,
    left: RELEASED
  };
  native.messages = [{
    notification: 0x400,
    x: 110,
    y: 112
  }];
  tick();
  tick();
  assert.deepEqual(clicks, ["click"]);
  handle.remove();
});

test("what the shell sent while a handler blocked is dropped, so a menu does not open again", () => {
  let opened = 0;
  const { native, tick, handle } = start({
    oncontextmenu() {
      opened++;
      native.messages = [{
        notification: 0x7b,
        x: 1,
        y: 2
      }];
    }
  });
  native.messages = [{
    notification: 0x7b,
    x: 1,
    y: 2
  }];
  tick();
  tick();
  tick();
  tick();
  assert.equal(opened, 1);
  handle.remove();
});

test("with the shell's messages heard, a menu opens on its context-menu message and not on the polled right click", () => {
  let opened = 0;
  const { native, tick, handle } = start({ oncontextmenu: () => opened++ });
  native.isReceivingMessages = true;
  native.pointer = {
    ...native.pointer,
    x: 110,
    y: 112,
    right: DOWN,
    isOnTray: true
  };
  tick();
  native.pointer = {
    ...native.pointer,
    right: RELEASED
  };
  tick();
  assert.equal(opened, 0);
  native.messages = [{
    notification: 0x7b,
    x: 110,
    y: 112
  }];
  tick();
  tick();
  assert.equal(opened, 1);
  handle.remove();
});
