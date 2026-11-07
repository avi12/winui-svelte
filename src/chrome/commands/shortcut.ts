import { HotkeyModifier, parseHotkey } from "#src/app/hotkeys/keys.js";
import type { HotkeyChord, HotkeyKeyName } from "#src/app/hotkeys/keys.js";

// Chrome's shortcut spelling ("Ctrl+Shift+Y", "MacCtrl+Comma", "MediaPlayPause")
// read as a hotkey of this package: one pure parser, so getAll and the
// registration agree on what a shortcut means.

const SEPARATOR = "+";

// Command and MacCtrl are the Mac's own modifiers; the key a Mac user presses
// with them is the one a Windows user presses with Ctrl.
const MODIFIERS = new Map<string, HotkeyModifier>([
  ["ctrl", HotkeyModifier.control],
  ["command", HotkeyModifier.control],
  ["macctrl", HotkeyModifier.control],
  ["alt", HotkeyModifier.alt],
  ["shift", HotkeyModifier.shift]
]);

const DISPLAY_MODIFIERS = new Map<HotkeyModifier, string>([
  [HotkeyModifier.control, "Ctrl"],
  [HotkeyModifier.alt, "Alt"],
  [HotkeyModifier.shift, "Shift"]
]);

const KEYS = new Map<string, HotkeyKeyName>([
  ["comma", "comma"],
  ["period", "period"],
  ["home", "home"],
  ["end", "end"],
  ["pageup", "pageup"],
  ["pagedown", "pagedown"],
  ["space", "space"],
  ["insert", "insert"],
  ["delete", "delete"],
  ["up", "arrowup"],
  ["down", "arrowdown"],
  ["left", "arrowleft"],
  ["right", "arrowright"],
  ["medianexttrack", "mediatracknext"],
  ["mediaplaypause", "mediaplaypause"],
  ["mediaprevtrack", "mediatrackprevious"],
  ["mediastop", "mediastop"]
]);

const CHARACTER_KEY = /^(?:[a-z0-9]|f(?:[1-9]|1[0-2]))$/u;

/** A shortcut Chrome's way, read for Windows. */
export interface ParsedShortcut {
  /** The hotkey to register. */
  readonly chord: HotkeyChord;

  /** The shortcut spelled as Chrome's `getAll` returns it: `"Ctrl+Shift+Y"`. */
  readonly display: string;
}

function keyNameOf(spelling: string) {
  const lower = spelling.toLowerCase();
  const mapped = KEYS.get(lower);
  const isMapped = mapped !== undefined;
  if (isMapped) {
    return mapped;
  }

  const isCharacterKey = CHARACTER_KEY.test(lower);
  if (isCharacterKey) {
    return parseHotkey(lower).keyName;
  }

  throw new Error(`"${spelling}" is not a key a command shortcut can use`);
}

/**
 * Reads a `suggested_key` string. `Ctrl`, `Alt` and `Shift` keep their
 * meaning, and `Command` and `MacCtrl` (the Mac's modifiers) become Ctrl.
 *
 * @param shortcut - Modifiers and one key joined by `+`: `"Ctrl+Shift+Y"`.
 * @returns The hotkey and its display spelling.
 * @throws Error When a part is neither a modifier nor a key Chrome names.
 */
export function parseShortcut(shortcut: string) {
  const parts = shortcut.split(SEPARATOR).map(part => part.trim());
  const spelledKey = parts.at(-1) ?? "";
  const modifiers = new Set<HotkeyModifier>();
  for (const spelling of parts.slice(0, -1)) {
    const modifier = MODIFIERS.get(spelling.toLowerCase());
    const isModifier = modifier !== undefined;
    if (!isModifier) {
      throw new Error(`"${spelling}" is not a modifier a command shortcut can use`);
    }

    modifiers.add(modifier);
  }

  const key = keyNameOf(spelledKey);
  const ordered = Object.values(HotkeyModifier).filter(modifier => modifiers.has(modifier));
  const names = ordered.map(modifier => DISPLAY_MODIFIERS.get(modifier) ?? "");
  const isCharacterKey = CHARACTER_KEY.test(spelledKey.toLowerCase());
  const keyDisplay = isCharacterKey ? spelledKey.toUpperCase() : spelledKey;
  return {
    chord: {
      modifiers: ordered,
      key
    },
    display: [...names, keyDisplay].join(SEPARATOR)
  } satisfies ParsedShortcut;
}
