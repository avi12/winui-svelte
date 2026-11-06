import { HotkeyParseError } from "./errors.ts";
import { KeyCode } from "#src/key-code.js";
import type { KeyCodeName } from "#src/key-code.js";

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

type NameOf<Code extends string> = Code extends `key${infer Letter}` ? Lowercase<Letter> : Lowercase<Code>;
/**
 * The name of a key a hotkey can bind: `KeyCode`'s names in lowercase, with the
 * letters bare (`k`, `digit5`, `arrowleft`, `f23`).
 */
export type HotkeyKeyName = NameOf<KeyCodeName>;

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
  readonly virtualKey: KeyCode;
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

const LETTER_PREFIX = /^key(?=[a-z]$)/u;

const VIRTUAL_KEYS = new Map<string, KeyCode>(
  Object.entries(KeyCode).map(([code, virtualKey]) => [code.toLowerCase().replace(LETTER_PREFIX, ""), virtualKey])
);

function isKeyName(name: string): name is HotkeyKeyName {
  return VIRTUAL_KEYS.has(name);
}

function virtualKeyOf(keyName: HotkeyKeyName) {
  const virtualKey = VIRTUAL_KEYS.get(keyName);
  const isMissing = virtualKey === undefined;
  if (isMissing) {
    throw new HotkeyParseError(`"${keyName}" is not a key a hotkey can bind`);
  }

  return virtualKey;
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
    virtualKey: virtualKeyOf(keyName),
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
 * the key is a `KeyCode` name in lowercase or one of a few aliases (`esc`, `del`, `left`).
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
