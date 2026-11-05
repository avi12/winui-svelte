import { VirtualKey } from "#winui/windows/system/VirtualKey";

// A WinUI VirtualKey as the web names it: `key` (what the key means) and
// `code` (which physical key it is). WinUI has no keyboard layout, so a letter
// is taken as the US layout has it, and the keys WinUI has no VirtualKey for
// (punctuation) are `Unidentified`.

const UNIDENTIFIED_KEY = "Unidentified";

const LETTER_COUNT = 26;
const FIRST_FUNCTION_KEY = VirtualKey.F1;
const LAST_FUNCTION_KEY = VirtualKey.F24;
const SPACE = " ";

interface KeyName {
  readonly key: string;
  readonly code: string;
}

function named({ key, code = key }: {
  key: string;
  code?: string;
}) {
  return {
    key,
    code
  } satisfies KeyName;
}

const NAMED_KEYS = new Map<number, KeyName>([
  [VirtualKey.Enter, named({ key: "Enter" })],
  [VirtualKey.Escape, named({ key: "Escape" })],
  [VirtualKey.Tab, named({ key: "Tab" })],
  [VirtualKey.Back, named({
    key: "Backspace"
  })],
  [VirtualKey.Space, named({
    key: SPACE,
    code: "Space"
  })],
  [VirtualKey.Delete, named({ key: "Delete" })],
  [VirtualKey.Insert, named({ key: "Insert" })],
  [VirtualKey.Home, named({ key: "Home" })],
  [VirtualKey.End, named({ key: "End" })],
  [VirtualKey.PageUp, named({ key: "PageUp" })],
  [VirtualKey.PageDown, named({ key: "PageDown" })],
  [VirtualKey.Left, named({ key: "ArrowLeft" })],
  [VirtualKey.Up, named({ key: "ArrowUp" })],
  [VirtualKey.Right, named({ key: "ArrowRight" })],
  [VirtualKey.Down, named({ key: "ArrowDown" })],
  [VirtualKey.Pause, named({ key: "Pause" })],
  [VirtualKey.Snapshot, named({
    key: "PrintScreen"
  })],
  [VirtualKey.Application, named({
    key: "ContextMenu"
  })],
  [VirtualKey.CapitalLock, named({
    key: "CapsLock"
  })],
  [VirtualKey.NumberKeyLock, named({
    key: "NumLock"
  })],
  [VirtualKey.Scroll, named({
    key: "ScrollLock"
  })],
  [VirtualKey.LeftWindows, named({
    key: "Meta",
    code: "MetaLeft"
  })],
  [VirtualKey.RightWindows, named({
    key: "Meta",
    code: "MetaRight"
  })],
  [VirtualKey.LeftShift, named({
    key: "Shift",
    code: "ShiftLeft"
  })],
  [VirtualKey.RightShift, named({
    key: "Shift",
    code: "ShiftRight"
  })],
  [VirtualKey.LeftControl, named({
    key: "Control",
    code: "ControlLeft"
  })],
  [VirtualKey.RightControl, named({
    key: "Control",
    code: "ControlRight"
  })],
  [VirtualKey.LeftMenu, named({
    key: "Alt",
    code: "AltLeft"
  })],
  [VirtualKey.RightMenu, named({
    key: "Alt",
    code: "AltRight"
  })],
  [VirtualKey.Multiply, named({
    key: "*",
    code: "NumpadMultiply"
  })],
  [VirtualKey.Add, named({
    key: "+",
    code: "NumpadAdd"
  })],
  [VirtualKey.Subtract, named({
    key: "-",
    code: "NumpadSubtract"
  })],
  [VirtualKey.Decimal, named({
    key: ".",
    code: "NumpadDecimal"
  })],
  [VirtualKey.Divide, named({
    key: "/",
    code: "NumpadDivide"
  })]
]);

// WinUI reports Shift, Control and Alt without a side; the key status says which.
const SIDED_KEYS = new Map<number, {
  left: number;
  right: number;
}>([
  [VirtualKey.Shift, {
    left: VirtualKey.LeftShift,
    right: VirtualKey.RightShift
  }],
  [VirtualKey.Control, {
    left: VirtualKey.LeftControl,
    right: VirtualKey.RightControl
  }],
  [VirtualKey.Menu, {
    left: VirtualKey.LeftMenu,
    right: VirtualKey.RightMenu
  }]
]);

function sideOf({ key, isRight }: {
  key: number;
  isRight: boolean;
}) {
  const sided = SIDED_KEYS.get(key);
  const isSideless = sided === undefined;
  if (isSideless) {
    return key;
  }

  return isRight ? sided.right : sided.left;
}

function isIn({ key, first, last }: {
  key: number;
  first: number;
  last: number;
}) {
  return key >= first && key <= last;
}

function letterName({ key, isUpper }: {
  key: number;
  isUpper: boolean;
}) {
  const letter = String.fromCharCode(key);
  return named({
    key: isUpper ? letter : letter.toLowerCase(),
    code: `Key${letter}`
  });
}

/**
 * Names a key the way the web does.
 *
 * @param options - The key; whether Shift or Caps Lock makes letters upper
 *     case; for Shift, Control and Alt, whether the key is the right one.
 * @returns The `key` and the `code` of the web's `KeyboardEvent`.
 */
export function keyNameOf({ key, isUpper, isRight }: {
  key: number;
  isUpper: boolean;
  isRight: boolean;
}) {
  const resolved = sideOf({
    key,
    isRight
  });
  const isLetter = isIn({
    key: resolved,
    first: VirtualKey.A,
    last: VirtualKey.A + LETTER_COUNT - 1
  });
  if (isLetter) {
    return letterName({
      key: resolved,
      isUpper
    });
  }

  const isDigit = isIn({
    key: resolved,
    first: VirtualKey.Number0,
    last: VirtualKey.Number9
  });
  if (isDigit) {
    const digit = String(resolved - VirtualKey.Number0);
    return named({
      key: digit,
      code: `Digit${digit}`
    });
  }

  const isNumpadDigit = isIn({
    key: resolved,
    first: VirtualKey.NumberPad0,
    last: VirtualKey.NumberPad9
  });
  if (isNumpadDigit) {
    const digit = String(resolved - VirtualKey.NumberPad0);
    return named({
      key: digit,
      code: `Numpad${digit}`
    });
  }

  const isFunction = isIn({
    key: resolved,
    first: FIRST_FUNCTION_KEY,
    last: LAST_FUNCTION_KEY
  });
  if (isFunction) {
    return named({
      key: `F${resolved - FIRST_FUNCTION_KEY + 1}`
    });
  }

  return NAMED_KEYS.get(resolved) ?? named({ key: UNIDENTIFIED_KEY });
}
