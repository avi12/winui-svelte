import { createMenuThread } from "./menu-thread.ts";
import type { MenuThreadHandle, MenuThreadMessage } from "./menu-thread.ts";
import { createMenuBuilder } from "./native.ts";
import { resolveMenu } from "#src/tray/menu/resolve.js";
import { MenuItemKind } from "#src/tray/menu/types.js";
import { bindDll, DWORD_BYTES, withMemory } from "#src/win32-calls.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The popup menu on its thread, real: the menu of a hidden owner window of the thread is opened, seen
// in menu mode from here and dismissed by a message to its owner, never by input and never a click on
// a window of another app.

const WM_CANCELMODE = 0x1F;
const TPM_RETURNCMD = 0x100;
const TPM_RIGHTBUTTON = 0x2;
const TPM_NONOTIFY = 0x80;
const GUI_INMENUMODE = 0x4;
const GUI_INFO_SIZE = 72;
const OFFSET_FLAGS = 4;
const CYCLES = 24;
const POLL_MILLISECONDS = 2;
const TICK_MILLISECONDS = 10;
const MAXIMUM_STALL_MILLISECONDS = 150;
const MENU_ORIGIN = {
  x: 0,
  y: 0
};
const FLAGS = TPM_RETURNCMD | TPM_NONOTIFY | TPM_RIGHTBUTTON;
const ITEMS = resolveMenu({
  items: [{
    kind: MenuItemKind.COMMAND,
    id: "one",
    label: "One"
  }, {
    kind: MenuItemKind.COMMAND,
    id: "two",
    label: "Two"
  }]
});

const user32 = bindDll({
  dll: "user32.dll",
  functions: {
    threadOf: ["GetWindowThreadProcessId", ["pointer", "pointer"], "u32"],
    guiInfo: ["GetGUIThreadInfo", ["u32", "pointer"], "i32"],
    post: ["PostMessageW", ["pointer", "u32", "pointer", "pointer"], "i32"]
  }
});

function isInMenuMode(thread: number) {
  return withMemory({
    size: GUI_INFO_SIZE,
    alignment: DWORD_BYTES,
    use(info) {
      info.writeU32(0, GUI_INFO_SIZE);
      user32.guiInfo(thread, info);
      return (info.readU32(OFFSET_FLAGS) & GUI_INMENUMODE) !== 0;
    }
  });
}

function noop() {}

function pause(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

// Dismisses the menu of `owner` as soon as its thread is in menu mode; resolves to whether it ever was.
async function dismissWhenOpen(owner: bigint) {
  const thread = user32.threadOf(owner, null);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (isInMenuMode(thread)) {
      user32.post(owner, WM_CANCELMODE, null, null);
      return true;
    }

    await pause(POLL_MILLISECONDS);
  }

  return false;
}

function showOnce({ menu, gate }: {
  readonly menu: bigint;
  readonly gate: ReturnType<typeof createMenuThread>;
}) {
  const entered: Promise<boolean>[] = [];
  const closed = gate.track({
    menu,
    flags: FLAGS,
    point: MENU_ORIGIN,
    focus(owner) {
      entered.push(dismissWhenOpen(owner));
      return true;
    }
  });
  return {
    closed,
    entered
  };
}

test("every menu enters its own loop, in rapid repeats, while the thread of the host keeps running", async () => {
  const built = createMenuBuilder().build({
    items: ITEMS,
    isDark: false
  });
  let lastTick = Date.now();
  let worstStall = 0;
  const clock = setInterval(() => {
    const now = Date.now();
    worstStall = Math.max(worstStall, now - lastTick);
    lastTick = now;
  }, TICK_MILLISECONDS);
  try {
    const gate = createMenuThread();
    for (let cycle = 0; cycle < CYCLES; cycle++) {
      const { closed, entered } = showOnce({
        menu: built.menu,
        gate
      });
      assert.equal(await closed, 0, `cycle ${cycle}: dismissed with no pick`);
      assert.deepEqual(await Promise.all(entered), [true], `cycle ${cycle}: the menu loop was entered`);
    }
  } finally {
    clearInterval(clock);
    built.destroy();
  }

  assert.ok(worstStall < MAXIMUM_STALL_MILLISECONDS, `the host stalled ${worstStall} ms while menus were open`);
});

test("a menu opened right after another was dismissed starts cleanly", async () => {
  const built = createMenuBuilder().build({
    items: ITEMS,
    isDark: false
  });
  try {
    const gate = createMenuThread();
    const first = showOnce({
      menu: built.menu,
      gate
    });
    const second = showOnce({
      menu: built.menu,
      gate
    });
    assert.deepEqual(await Promise.all([first.closed, second.closed]), [0, 0]);
    assert.deepEqual(await Promise.all([...first.entered, ...second.entered]), [true, true]);
  } finally {
    built.destroy();
  }
});

test("a menu whose owner cannot be put in front is never shown and reports no pick", async () => {
  const built = createMenuBuilder().build({
    items: ITEMS,
    isDark: false
  });
  try {
    const command = await createMenuThread().track({
      menu: built.menu,
      flags: FLAGS,
      point: MENU_ORIGIN,
      focus: () => false
    });
    assert.equal(command, 0);
  } finally {
    built.destroy();
  }
});

test("a thread that fails rejects the menu instead of leaving it waiting", async () => {
  let fail = noop;
  const failing: MenuThreadHandle = {
    postMessage: noop,
    listen({ failure }) {
      fail = () => failure(new Error("no user32"));
    },
    terminate: noop
  };
  const pending = createMenuThread({ spawn: () => failing }).track({
    menu: 1n,
    flags: FLAGS,
    point: MENU_ORIGIN,
    focus: () => true
  });
  fail();
  await assert.rejects(pending, /no user32/u);
});

test("a thread's owner window is asked to be brought to the front before the menu opens", async () => {
  const log: string[] = [];
  let say = (_message: MenuThreadMessage) => {};
  const fake: MenuThreadHandle = {
    postMessage: command => log.push(`command ${command.type}`),
    listen({ message }) {
      say = message;
    },
    terminate: noop
  };
  const pending = createMenuThread({ spawn: () => fake }).track({
    menu: 7n,
    flags: FLAGS,
    point: MENU_ORIGIN,
    focus(owner) {
      log.push(`focus ${owner}`);
      return true;
    }
  });
  say({
    type: "owner",
    owner: 9n
  });
  say({
    type: "closed",
    command: 3
  });
  assert.equal(await pending, 3);
  assert.deepEqual(log, ["focus 9", "command track"]);
});
