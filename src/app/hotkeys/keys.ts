import { HotkeyParseError } from "./errors.ts";

// The vocabulary of a global hotkey: the modifiers Windows knows and the keys
// it can bind, named as `KeyboardEvent.code` names them (lowercase, with
// `digit5` for the number row and `arrowleft`), and one pure parser from a
// string such as `ctrl+alt+k` or a typed object to the Win32 arguments. The
// tables are the one source: the parser, the types and the docs read them.

/** The modifiers a hotkey takes; the order here is the order a combination is spelled in. */
export const HotkeyModifier = {
  control: "control",
  alt: "alt",
  shift: "shift",
  windows: "windows"
} as const;
/** One of `HotkeyModifier`'s values. */
export type HotkeyModifier = typeof HotkeyModifier[keyof typeof HotkeyModifier];

/** The keys a hotkey can bind, each one name for its Win32 virtual-key code (`HotkeyKey.f23` is `0x86`). */
export const HotkeyKey = {
  a: 0x41,
  b: 0x42,
  c: 0x43,
  d: 0x44,
  e: 0x45,
  f: 0x46,
  g: 0x47,
  h: 0x48,
  i: 0x49,
  j: 0x4a,
  k: 0x4b,
  l: 0x4c,
  m: 0x4d,
  n: 0x4e,
  o: 0x4f,
  p: 0x50,
  q: 0x51,
  r: 0x52,
  s: 0x53,
  t: 0x54,
  u: 0x55,
  v: 0x56,
  w: 0x57,
  x: 0x58,
  y: 0x59,
  z: 0x5a,
  digit0: 0x30,
  digit1: 0x31,
  digit2: 0x32,
  digit3: 0x33,
  digit4: 0x34,
  digit5: 0x35,
  digit6: 0x36,
  digit7: 0x37,
  digit8: 0x38,
  digit9: 0x39,
  f1: 0x70,
  f2: 0x71,
  f3: 0x72,
  f4: 0x73,
  f5: 0x74,
  f6: 0x75,
  f7: 0x76,
  f8: 0x77,
  f9: 0x78,
  f10: 0x79,
  f11: 0x7a,
  f12: 0x7b,
  f13: 0x7c,
  f14: 0x7d,
  f15: 0x7e,
  f16: 0x7f,
  f17: 0x80,
  f18: 0x81,
  f19: 0x82,
  f20: 0x83,
  f21: 0x84,
  f22: 0x85,
  f23: 0x86,
  f24: 0x87,
  numpad0: 0x60,
  numpad1: 0x61,
  numpad2: 0x62,
  numpad3: 0x63,
  numpad4: 0x64,
  numpad5: 0x65,
  numpad6: 0x66,
  numpad7: 0x67,
  numpad8: 0x68,
  numpad9: 0x69,
  enter: 0x0d,
  escape: 0x1b,
  space: 0x20,
  tab: 0x09,
  backspace: 0x08,
  delete: 0x2e,
  insert: 0x2d,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22,
  arrowleft: 0x25,
  arrowup: 0x26,
  arrowright: 0x27,
  arrowdown: 0x28,
  pause: 0x13,
  printscreen: 0x2c,
  scrolllock: 0x91,
  numlock: 0x90,
  capslock: 0x14,
  semicolon: 0xba,
  equal: 0xbb,
  comma: 0xbc,
  minus: 0xbd,
  period: 0xbe,
  slash: 0xbf,
  backquote: 0xc0,
  bracketleft: 0xdb,
  backslash: 0xdc,
  bracketright: 0xdd,
  quote: 0xde,
  numpadmultiply: 0x6a,
  numpadadd: 0x6b,
  numpadsubtract: 0x6d,
  numpaddecimal: 0x6e,
  numpaddivide: 0x6f,
  volumemute: 0xad,
  volumedown: 0xae,
  volumeup: 0xaf,
  medianexttrack: 0xb0,
  mediaprevioustrack: 0xb1,
  mediastop: 0xb2,
  mediaplaypause: 0xb3
} as const;
/** The virtual-key code of one of `HotkeyKey`'s keys. */
export type HotkeyKey = typeof HotkeyKey[keyof typeof HotkeyKey];
/** The name of one of the keys, as `HotkeyKey` spells it. */
export type HotkeyKeyName = keyof typeof HotkeyKey;

/** A hotkey as an object: the modifiers held and the key pressed. */
export interface HotkeyChord {
  readonly modifiers?: readonly HotkeyModifier[] | undefined;
  readonly key: HotkeyKeyName;
}

/** What a hotkey is written as: `"ctrl+alt+k"`, or a `HotkeyChord`. */
export type HotkeyKeys = string | HotkeyChord;

/** A hotkey the parser understood, in one canonical form. */
interface ParsedHotkey {
  /** The modifiers, without duplicates, in the order of `HotkeyModifier`. */
  readonly modifiers: readonly HotkeyModifier[];
  readonly keyName: HotkeyKeyName;
  readonly virtualKey: HotkeyKey;
  /** The canonical spelling: `"control+alt+k"`. */
  readonly keys: string;
  /** The `fsModifiers` bits for `RegisterHotKey`, without `MOD_NOREPEAT`. */
  readonly modifierFlags: number;
}

const MODIFIER_FLAGS = {
  [HotkeyModifier.alt]: 0x1,
  [HotkeyModifier.control]: 0x2,
  [HotkeyModifier.shift]: 0x4,
  [HotkeyModifier.windows]: 0x8
} as const;

const MODIFIER_ALIASES = new Map<string, HotkeyModifier>([
  ["ctrl", HotkeyModifier.control],
  ["control", HotkeyModifier.control],
  ["alt", HotkeyModifier.alt],
  ["option", HotkeyModifier.alt],
  ["shift", HotkeyModifier.shift],
  ["win", HotkeyModifier.windows],
  ["windows", HotkeyModifier.windows],
  ["meta", HotkeyModifier.windows],
  ["super", HotkeyModifier.windows]
]);

const KEY_ALIASES = new Map<string, HotkeyKeyName>([
  ["esc", "escape"],
  ["return", "enter"],
  ["del", "delete"],
  ["ins", "insert"],
  ["pgup", "pageup"],
  ["pgdn", "pagedown"],
  ["left", "arrowleft"],
  ["up", "arrowup"],
  ["right", "arrowright"],
  ["down", "arrowdown"],
  ["spacebar", "space"],
  ["dash", "minus"],
  ["backtick", "backquote"]
]);

const SEPARATOR = "+";

function isKeyName(name: string): name is HotkeyKeyName {
  return Object.hasOwn(HotkeyKey, name);
}

function keyNameOf(spelling: string) {
  const name = KEY_ALIASES.get(spelling) ?? spelling;
  if (isKeyName(name)) {
    return name;
  }

  const isDigit = /^\d$/u.test(spelling);
  if (isDigit) {
    return keyNameOf(`digit${spelling}`);
  }

  throw new HotkeyParseError(`"${spelling}" is not a key a hotkey can bind`);
}

function modifierOf(spelling: string) {
  const modifier = MODIFIER_ALIASES.get(spelling);
  const isUnknown = modifier === undefined;
  if (isUnknown) {
    throw new HotkeyParseError(`"${spelling}" is not a modifier or a key`);
  }

  return modifier;
}

function flagsOf(modifiers: readonly HotkeyModifier[]) {
  let flags = 0;
  for (const modifier of modifiers) {
    flags |= MODIFIER_FLAGS[modifier];
  }

  return flags;
}

function assemble({ modifiers, keyName }: {
  modifiers: readonly HotkeyModifier[];
  keyName: HotkeyKeyName;
}) {
  const unique = new Set(modifiers);
  const hasDuplicate = unique.size !== modifiers.length;
  if (hasDuplicate) {
    throw new HotkeyParseError("a modifier is named twice");
  }

  const ordered = Object.values(HotkeyModifier).filter(modifier => unique.has(modifier));
  return {
    modifiers: ordered,
    keyName,
    virtualKey: HotkeyKey[keyName],
    keys: [...ordered, keyName].join(SEPARATOR),
    modifierFlags: flagsOf(ordered)
  } satisfies ParsedHotkey;
}

function parseText(text: string) {
  const parts = text.split(SEPARATOR).map(part => part.trim().toLowerCase());
  const hasEmptyPart = parts.includes("");
  if (hasEmptyPart) {
    throw new HotkeyParseError(`"${text}" has an empty part`);
  }

  const spelledKey = parts.at(-1) ?? "";
  const spelledModifiers = parts.slice(0, -1);
  return assemble({
    modifiers: spelledModifiers.map(modifierOf),
    keyName: keyNameOf(spelledKey)
  });
}

/**
 * Reads a hotkey. A string is modifiers and one key joined by `+`, in any
 * case: `ctrl+alt+k`, `win+shift+f23`, `ctrl+5`; `ctrl`, `control`, `alt`,
 * `option`, `shift`, `win`, `windows`, `meta` and `super` are modifiers, and
 * the key is a `HotkeyKey` name or one of a few aliases (`esc`, `del`, `left`).
 *
 * @param keys - The string or the object.
 * @returns The canonical form.
 * @throws HotkeyParseError When the string is empty, names an unknown part, a modifier twice or no key.
 */
export function parseHotkey(keys: HotkeyKeys) {
  const isText = typeof keys === "string";
  if (isText) {
    return parseText(keys);
  }

  return assemble({
    modifiers: keys.modifiers ?? [],
    keyName: keyNameOf(keys.key)
  });
}
