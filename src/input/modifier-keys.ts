import { createKeyStateReader } from "#src/win32-key-state.js";

const VIRTUAL_KEY_SHIFT = 0x10;
const VIRTUAL_KEY_CONTROL = 0x11;
const VIRTUAL_KEY_ALT = 0x12;

/** Which of the modifier keys are held, named as the `shiftKey`, `ctrlKey` and `altKey` of a DOM event. */
export interface ModifierKeys {
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
}

/**
 * Reads which modifier keys are held at this moment, for a click, a submit or
 * a pick that carries no key state of its own (a keyboard `Enter` on a form).
 * It only reads; nothing is sent.
 *
 * @param options - `readKey` is for tests: it gets a virtual key code and says whether the key is down.
 * @returns The three flags.
 */
export function modifierKeysHeld({ readKey = createKeyStateReader() }: {
  readonly readKey?: (virtualKey: number) => { readonly isDown: boolean };
} = {}) {
  return {
    shiftKey: readKey(VIRTUAL_KEY_SHIFT).isDown,
    ctrlKey: readKey(VIRTUAL_KEY_CONTROL).isDown,
    altKey: readKey(VIRTUAL_KEY_ALT).isDown
  } satisfies ModifierKeys;
}
