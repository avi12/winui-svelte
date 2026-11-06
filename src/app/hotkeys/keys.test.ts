import { HotkeyParseError } from "./errors.ts";
import { HotkeyModifier, parseHotkey } from "./keys.ts";
import { KeyCode } from "#src/key-code.js";
import assert from "node:assert/strict";
import { test } from "node:test";

const MOD_ALT = 1;
const MOD_CONTROL = 2;
const MOD_SHIFT = 4;
const MOD_WIN = 8;

test("a string names modifiers and one key, in any case and spacing", () => {
  const parsed = parseHotkey(" Ctrl + ALT +K ");
  assert.deepEqual(parsed.modifiers, [HotkeyModifier.control, HotkeyModifier.alt]);
  assert.equal(parsed.keyName, "k");
  assert.equal(parsed.virtualKey, KeyCode.keyK);
  assert.equal(parsed.virtualKey, 0x4b);
  assert.equal(parsed.modifierFlags, MOD_CONTROL | MOD_ALT);
  assert.equal(parsed.keys, "control+alt+k");
});

test("the modifier aliases mean what the names do, and the canonical order does not depend on the spelling", () => {
  const spellings = ["win+shift+ctrl+alt+f23", "meta+option+control+shift+f23", "super+alt+ctrl+shift+f23"];
  for (const spelling of spellings) {
    const parsed = parseHotkey(spelling);
    assert.equal(parsed.keys, "control+alt+shift+windows+f23");
    assert.equal(parsed.virtualKey, 0x86);
    assert.equal(parsed.modifierFlags, MOD_ALT | MOD_CONTROL | MOD_SHIFT | MOD_WIN);
  }
});

test("a key may stand alone, and a digit or an alias names a key", () => {
  assert.equal(parseHotkey("f23").modifierFlags, 0);
  assert.equal(parseHotkey("ctrl+5").keyName, "digit5");
  assert.equal(parseHotkey("ctrl+esc").keyName, "escape");
  assert.equal(parseHotkey("alt+left").keyName, "arrowleft");
  assert.equal(parseHotkey("mediaplaypause").virtualKey, 0xb3);
});

test("a typed object gives the same hotkey as its string", () => {
  const typed = parseHotkey({
    modifiers: [HotkeyModifier.alt, HotkeyModifier.control],
    key: "k"
  });
  assert.deepEqual(typed, parseHotkey("ctrl+alt+k"));
  assert.equal(parseHotkey({ key: "f23" }).keys, "f23");
});

test("invalid strings and objects fail with a parse error", () => {
  const invalid = ["", "ctrl+", "+k", "ctrl++k", "ctrl", "ctrl+shift", "ctrl+k+j", "hyper+k", "ctrl+nonsense", "ctrl+ctrl+k", "ctrl+control+k"];
  for (const keys of invalid) {
    assert.throws(() => parseHotkey(keys), HotkeyParseError, keys);
  }

  assert.throws(() => parseHotkey({
    modifiers: [HotkeyModifier.alt, HotkeyModifier.alt],
    key: "k"
  }), HotkeyParseError);
  assert.throws(() => parseHotkey({
    // @ts-expect-error a name from Object.prototype is not a key; the parser must not find it there
    key: "toString"
  }), HotkeyParseError);
});
