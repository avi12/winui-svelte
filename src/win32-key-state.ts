import { bindDll } from "#src/win32-calls.js";

// Reading a key or a mouse button with GetAsyncKeyState: the one place that
// knows the bits of its result.

const KEY_DOWN_BIT = 0x8000;
const KEY_PRESSED_BIT = 0x1;

/** The virtual key codes of the mouse buttons. */
export const PointerButtonKey = {
  left: 0x01,
  right: 0x02,
  middle: 0x04
} as const;

/**
 * What `GetAsyncKeyState` returned, as two flags.
 *
 * @param state - The call's result.
 * @returns `isDown` (held now) and `wasPressed` (pressed since the process
 *   last asked, a flag the first read that sees it clears).
 */
export function decodeKeyState(state: number) {
  return {
    isDown: (state & KEY_DOWN_BIT) !== 0,
    wasPressed: (state & KEY_PRESSED_BIT) !== 0
  };
}

/**
 * Reads whether a key or mouse button is held down, by virtual key code. It
 * only reads; nothing is sent. Bound when this is called, never when the
 * module loads.
 *
 * @returns A function from a virtual key code to `decodeKeyState`'s flags.
 */
export function createKeyStateReader() {
  const { keyState } = bindDll({
    dll: "user32.dll",
    functions: {
      keyState: ["GetAsyncKeyState", ["i32"], "i32"]
    }
  });
  return (virtualKey: number) => decodeKeyState(keyState(virtualKey));
}
