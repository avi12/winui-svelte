import { HotkeyConflictError, HotkeyParseError, HotkeyRefusedError } from "./errors.ts";
import { createHotkeyRegistry, ERROR_HOTKEY_ALREADY_REGISTERED, MOD_NOREPEAT } from "./registry.ts";
import type { HotkeyEvent, HotkeyWin32 } from "./registry.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const REFUSED = 5;
const MOD_CONTROL = 2;
const MOD_WIN = 8;
const VK_L = 0x4c;
const VK_F23 = 0x86;
const VK_F24 = 0x87;

function createFake() {
  const taken = new Map<string, number>();
  const calls: string[] = [];
  const errors: unknown[] = [];
  const win32 = {
    register({ id, modifierFlags, virtualKey }) {
      const combination = `${modifierFlags & ~MOD_NOREPEAT}:${virtualKey}`;
      calls.push(`register ${id} ${modifierFlags} ${virtualKey}`);
      const isReserved = modifierFlags === (MOD_WIN | MOD_NOREPEAT) && virtualKey === VK_L;
      if (isReserved) {
        return REFUSED;
      }

      if (taken.has(combination)) {
        return ERROR_HOTKEY_ALREADY_REGISTERED;
      }

      taken.set(combination, id);
      return null;
    },
    unregister(id) {
      calls.push(`unregister ${id}`);
      for (const [combination, owner] of taken) {
        const isOwner = owner === id;
        if (isOwner) {
          taken.delete(combination);
        }
      }
    }
  } satisfies HotkeyWin32;
  const registry = createHotkeyRegistry({
    win32,
    onerror(error) {
      errors.push(error);
    }
  });
  return {
    registry,
    calls,
    errors
  };
}

test("a press runs the callback of its id with a keyboard-like event", () => {
  const { registry } = createFake();
  const events: HotkeyEvent[] = [];
  const hotkey = registry.register({
    keys: "alt+ctrl+k",
    onpressed: event => events.push(event)
  });
  assert.equal(hotkey.isRegistered, true);
  assert.equal(registry.press(hotkey.id), true);
  assert.equal(registry.press(hotkey.id + 1), false);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    keys: "control+alt+k",
    key: "k",
    modifiers: ["control", "alt"],
    ctrlKey: true,
    altKey: true,
    shiftKey: false,
    metaKey: false
  });
});

test("the keys do not repeat unless asked", () => {
  const { registry, calls } = createFake();
  registry.register({
    keys: "ctrl+f23",
    onpressed: () => undefined
  });
  registry.register({
    keys: "ctrl+f24",
    isRepeatAllowed: true,
    onpressed: () => undefined
  });
  assert.deepEqual(calls, [
    `register 1 ${MOD_CONTROL | MOD_NOREPEAT} ${VK_F23}`,
    `register 2 ${MOD_CONTROL} ${VK_F24}`
  ]);
});

test("unregistering gives the combination back, once, and it is not heard again", () => {
  const { registry, calls } = createFake();
  let presses = 0;
  const first = registry.register({
    keys: "ctrl+alt+shift+f23",
    onpressed() {
      presses += 1;
    }
  });
  assert.throws(() => registry.register({
    keys: "shift+alt+ctrl+f23",
    onpressed: () => undefined
  }), HotkeyConflictError);
  first.unregister();
  first.unregister();
  assert.equal(first.isRegistered, false);
  assert.equal(registry.press(first.id), false);
  assert.equal(presses, 0);
  assert.equal(calls.filter(call => call.startsWith("unregister")).length, 1);
  const second = registry.register({
    keys: "ctrl+alt+shift+f23",
    onpressed: () => undefined
  });
  assert.notEqual(second.id, first.id);
  assert.equal(registry.size, 1);
});

test("failures are typed: a bad string and a refusal", () => {
  const { registry } = createFake();
  assert.throws(() => registry.register({
    keys: "ctrl+",
    onpressed: () => undefined
  }), HotkeyParseError);
  assert.throws(() => registry.register({
    keys: "win+l",
    onpressed: () => undefined
  }), error => error instanceof HotkeyRefusedError && error.code === REFUSED);
  assert.equal(registry.size, 0);
});

test("a callback that throws is reported and does not stop the registry", () => {
  const { registry, errors } = createFake();
  const hotkey = registry.register({
    keys: "f23",
    onpressed() {
      throw new Error("boom");
    }
  });
  assert.equal(registry.press(hotkey.id), true);
  assert.equal(errors.length, 1);
});
