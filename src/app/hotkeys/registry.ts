import { HotkeyConflictError, HotkeyRefusedError } from "./errors.ts";
import { HotkeyModifier, parseHotkey } from "./keys.ts";
import type { HotkeyKeyName, HotkeyKeys } from "./keys.ts";

// The hotkeys of one thread: which id belongs to which callback. The Win32
// calls are a parameter (`HotkeyWin32`), so everything here runs without
// Windows; native.ts is the real one.

/** `ERROR_HOTKEY_ALREADY_REGISTERED`. */
export const ERROR_HOTKEY_ALREADY_REGISTERED = 1409;
/** `MOD_NOREPEAT`: holding the keys down presses once. */
export const MOD_NOREPEAT = 0x4000;
/** The message Windows posts to the registering thread. */
export const WM_HOTKEY = 0x312;
const FIRST_ID = 1;

/** The two calls the registry makes. */
export interface HotkeyWin32 {
  /** `RegisterHotKey(NULL, id, modifierFlags, virtualKey)`; null when it worked, else the error code. */
  register(options: {
    id: number;
    modifierFlags: number;
    virtualKey: number;
  }): number | null;

  /** `UnregisterHotKey(NULL, id)`. */
  unregister(id: number): void;
}

/** What `onpressed` is told, shaped like the modifier fields of a `KeyboardEvent`. */
export interface HotkeyEvent {
  /** The canonical spelling of the combination: `"control+alt+k"`. */
  readonly keys: string;

  /** The key, named as `KeyCode` names it, in lowercase. */
  readonly key: HotkeyKeyName;
  readonly modifiers: readonly HotkeyModifier[];
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
}

/** What `registerHotkey` takes. */
export interface HotkeyOptions {
  /** The combination: `"ctrl+alt+k"` or `{ modifiers, key }`. */
  readonly keys: HotkeyKeys;

  /** Called on the UI thread each time the combination is pressed, anywhere in Windows. */
  readonly onpressed: (event: HotkeyEvent) => void;

  /** True lets holding the keys down press repeatedly; the default presses once. */
  readonly isRepeatAllowed?: boolean;
}

/** A registered hotkey. */
export interface Hotkey {
  /** The id Windows posts as the `wParam` of `WM_HOTKEY`. */
  readonly id: number;

  /** The canonical spelling of the combination. */
  readonly keys: string;

  /** False once `unregister` ran. */
  readonly isRegistered: boolean;

  /** Gives the combination back; calling it again does nothing. */
  unregister(): void;
}

interface Entry {
  readonly event: HotkeyEvent;
  readonly onpressed: (event: HotkeyEvent) => void;
}

/** The registered hotkeys of one thread, over the given Win32 calls. */
export function createHotkeyRegistry({ win32, onerror }: {
  win32: HotkeyWin32;
  onerror: (error: unknown) => void;
}) {
  const entries = new Map<number, Entry>();
  let nextId = FIRST_ID;

  return {
    get size() {
      return entries.size;
    },
    register({ keys, onpressed, isRepeatAllowed = false }: HotkeyOptions) {
      const parsed = parseHotkey(keys);
      const id = nextId;
      const modifierFlags = isRepeatAllowed ? parsed.modifierFlags : parsed.modifierFlags | MOD_NOREPEAT;
      const failure = win32.register({
        id,
        modifierFlags,
        virtualKey: parsed.virtualKey
      });
      const isFailed = failure !== null;
      if (isFailed) {
        const isTaken = failure === ERROR_HOTKEY_ALREADY_REGISTERED;
        const message = `${parsed.keys} cannot be registered`;
        throw isTaken
          ? new HotkeyConflictError(`${message}: another app or hotkey owns it`)
          : new HotkeyRefusedError({
            message: `${message}: Windows refused it (error ${failure})`,
            code: failure
          });
      }

      nextId += 1;
      entries.set(id, {
        onpressed,
        event: {
          keys: parsed.keys,
          key: parsed.keyName,
          modifiers: parsed.modifiers,
          ctrlKey: parsed.modifiers.includes(HotkeyModifier.control),
          altKey: parsed.modifiers.includes(HotkeyModifier.alt),
          shiftKey: parsed.modifiers.includes(HotkeyModifier.shift),
          metaKey: parsed.modifiers.includes(HotkeyModifier.windows)
        }
      });
      return {
        id,
        keys: parsed.keys,
        get isRegistered() {
          return entries.has(id);
        },
        unregister() {
          const isKnown = entries.delete(id);
          if (isKnown) {
            win32.unregister(id);
          }
        }
      } satisfies Hotkey;
    },
    /** Runs the callback of the hotkey `id`; false when no hotkey of this registry has that id. */
    press(id: number) {
      const entry = entries.get(id);
      const isUnknown = entry === undefined;
      if (isUnknown) {
        return false;
      }

      try {
        entry.onpressed(entry.event);
      } catch (error) {
        onerror(error);
      }

      return true;
    }
  };
}
