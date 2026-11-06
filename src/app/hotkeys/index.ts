import { createHotkeyWin32 } from "./native.ts";
import { createHotkeyRegistry, WM_HOTKEY } from "./registry.ts";
import type { HotkeyOptions } from "./registry.ts";
import { reportUiError } from "#src/ui-errors.js";
import { addMessageHook } from "#src/window/message-hooks.js";

// Global hotkeys: `RegisterHotKey` with no window posts `WM_HOTKEY` to the
// registering thread's queue, and the message pump of that thread (the UI
// thread's, or any thread that runs the package's pump) hands it to the
// registry before it dispatches anything. The registry is made when the first
// hotkey is registered, so an app that never registers one pays for none of it.

export type { HotkeyChord, HotkeyKeyName, HotkeyKeys } from "./keys.ts";
export { HotkeyModifier } from "./keys.ts";
export { HotkeyConflictError, HotkeyError, HotkeyParseError, HotkeyRefusedError } from "./errors.ts";
export type { Hotkey, HotkeyEvent, HotkeyOptions } from "./registry.ts";

const NO_WINDOW = 0n;
const SHARED_KEY = Symbol.for("winui-svelte.hotkeys");

function createThreadRegistry() {
  const registry = createHotkeyRegistry({
    win32: createHotkeyWin32(),
    onerror(error) {
      reportUiError({
        error,
        origin: "hotkey onpressed"
      });
    }
  });
  addMessageHook(({ hwnd, id, wParam }) => {
    const isThreadMessage = hwnd === NO_WINDOW;
    const isHotkey = isThreadMessage && id === WM_HOTKEY;
    return isHotkey && registry.press(Number(wParam));
  });
  return registry;
}

type ThreadRegistry = ReturnType<typeof createThreadRegistry>;

function isThreadRegistry(value: unknown): value is ThreadRegistry {
  return typeof value === "object" && value !== null && "register" in value && "press" in value;
}

function registryOfThread() {
  const existing: unknown = Object.getOwnPropertyDescriptor(globalThis, SHARED_KEY)?.value;
  if (isThreadRegistry(existing)) {
    return existing;
  }

  const created = createThreadRegistry();
  Object.defineProperty(globalThis, SHARED_KEY, { value: created });
  return created;
}

/**
 * Registers a system-wide hotkey: `onpressed` runs on the UI thread each time
 * the combination is pressed, whichever app has the focus. There is no web
 * analogue (a page cannot own a global key), so the callback is told a
 * `KeyboardEvent`-like object.
 *
 * Call it on the thread whose message pump runs (the UI thread, from
 * `onStart` or a component); the hotkeys belong to that thread, are given back
 * by `unregister`, and are freed by Windows when the thread ends. Nothing is
 * heard while that pump is not running. The combination is not repeated while
 * the keys stay down unless `isRepeatAllowed` is true.
 *
 * @param options - The combination and the callback.
 * @returns The registration; call `unregister` to give the combination back.
 * @throws HotkeyParseError When `keys` is not a hotkey.
 * @throws HotkeyConflictError When another app already owns the combination.
 * @throws HotkeyRefusedError When Windows refuses it, as it does for the ones it reserves (Win+L).
 */
export function registerHotkey(options: HotkeyOptions) {
  return registryOfThread().register(options);
}
