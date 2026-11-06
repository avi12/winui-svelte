import { keyNameOf } from "./key-names.ts";
import { InputKeyboardSource } from "#winui/microsoft/ui/input/InputKeyboardSource";
import type { KeyRoutedEventArgs } from "#winui/microsoft/ui/xaml/input/KeyRoutedEventArgs";
import { VirtualKey } from "#winui/windows/system/VirtualKey";
import { CoreVirtualKeyStates } from "#winui/windows/ui/core/CoreVirtualKeyStates";

const RIGHT_SHIFT_SCAN_CODE = 0x36;

/** The members of a DOM `KeyboardEvent` that WinUI knows. */
export interface KeyboardFields {
  readonly key: string;
  readonly code: string;
  readonly repeat: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;

  /** Always false: WinUI hands text input methods their own events, so read composed text from a TextBox. */
  readonly isComposing: boolean;
}

/** Reads a key's `CoreVirtualKeyStates` flags; the keyboard's own state by default, a fake in a test. */
export type KeyStateReader = (key: VirtualKey) => number;

/** The part of WinUI's `KeyRoutedEventArgs` the fields are read from. */
export type KeyArguments = Pick<KeyRoutedEventArgs, "key" | "keyStatus">;

function keyStateOf(key: VirtualKey) {
  return InputKeyboardSource.getKeyStateForCurrentThread(key);
}

function isDownIn(state: number) {
  return (state & CoreVirtualKeyStates.Down) !== 0;
}

/**
 * Reads the DOM members of a WinUI key event.
 *
 * @param options - The event's arguments; `stateOf` reads the modifier keys (the keyboard's by default).
 * @returns The fields of a DOM keyboard event.
 */
export function keyboardFields({ args, stateOf = keyStateOf }: {
  args: KeyArguments;
  stateOf?: KeyStateReader;
}) {
  const { key, keyStatus } = args;
  function isDown(modifier: VirtualKey) {
    return isDownIn(stateOf(modifier));
  }

  const isShifted = isDown(VirtualKey.Shift);
  const isCapsLocked = (stateOf(VirtualKey.CapitalLock) & CoreVirtualKeyStates.Locked) !== 0;
  const isRightShift = keyStatus.scanCode === RIGHT_SHIFT_SCAN_CODE;
  const isRight = key === VirtualKey.Shift ? isRightShift : keyStatus.isExtendedKey;
  const name = keyNameOf({
    key,
    isUpper: isShifted !== isCapsLocked,
    isRight
  });
  return {
    key: name.key,
    code: name.code,
    repeat: keyStatus.wasKeyDown && !keyStatus.isKeyReleased,
    ctrlKey: isDown(VirtualKey.Control),
    altKey: isDown(VirtualKey.Menu),
    shiftKey: isShifted,
    metaKey: isDown(VirtualKey.LeftWindows) || isDown(VirtualKey.RightWindows),
    isComposing: false
  } satisfies KeyboardFields;
}
