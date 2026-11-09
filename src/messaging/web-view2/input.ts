import type { WebView2Like } from "./core.ts";
import { callDevToolsMethod } from "./protocol.ts";

/** The kind of a key event. */
export const KeyEventType = {
  KEY_DOWN: "keyDown",
  KEY_UP: "keyUp",
  RAW_KEY_DOWN: "rawKeyDown",
  CHAR: "char"
} as const;
/** One of the values of `KeyEventType`. */
export type KeyEventType = (typeof KeyEventType)[keyof typeof KeyEventType];

/** The mouse button of a click. */
export const MouseButton = {
  LEFT: "left",
  MIDDLE: "middle",
  RIGHT: "right"
} as const;
/** One of the values of `MouseButton`. */
export type MouseButton = (typeof MouseButton)[keyof typeof MouseButton];

/** How `typeText` enters the text. */
export const TypeMode = {
  /** A key down and a key up for every character. */
  KEYS: "keys",
  /** The first character as keys, the rest in one `Input.insertText`. */
  INSERT_AFTER_FIRST: "insertAfterFirst"
} as const;
/** One of the values of `TypeMode`. */
export type TypeMode = (typeof TypeMode)[keyof typeof TypeMode];

const DISPATCH_KEY_EVENT = "Input.dispatchKeyEvent";
const DISPATCH_MOUSE_EVENT = "Input.dispatchMouseEvent";
const INSERT_TEXT = "Input.insertText";
const TEXT_KEY_TYPES = new Set<KeyEventType>([KeyEventType.KEY_DOWN, KeyEventType.CHAR]);

/** The parameters of `Input.dispatchKeyEvent`, built in one place. */
export function keyEventParameters({ type, key, text, modifiers = 0 }: {
  type: KeyEventType;
  key: string;
  text?: string;
  modifiers?: number;
}) {
  const isSingleCharacter = [...key].length === 1;
  const typed = text ?? (isSingleCharacter ? key : undefined);
  const hasText = typed !== undefined && TEXT_KEY_TYPES.has(type);
  return {
    type,
    key,
    modifiers,
    ...hasText ? { text: typed } : {}
  };
}

/** The parameters of `Input.dispatchMouseEvent`. */
function mouseEventParameters({ type, x, y, button, clickCount }: {
  type: "mousePressed" | "mouseReleased" | "mouseMoved";
  x: number;
  y: number;
  button: MouseButton;
  clickCount: number;
}) {
  return {
    type,
    x,
    y,
    button,
    clickCount
  };
}

/**
 * Sends one trusted key event to the page; `text` defaults to `key` when it is
 * one character
 */
export async function dispatchKey({ control, key, type, text, modifiers }: {
  control: WebView2Like;
  key: string;
  type: KeyEventType;
  text?: string;
  modifiers?: number;
}) {
  await callDevToolsMethod({
    control,
    method: DISPATCH_KEY_EVENT,
    parameters: keyEventParameters({
      type,
      key,
      ...text === undefined ? {} : { text },
      ...modifiers === undefined ? {} : { modifiers }
    })
  });
}

/** Sends a trusted mouse click (press and release) at a point of the page, in CSS pixels. */
export async function dispatchMouseClick({ control, x, y, button = MouseButton.LEFT, clickCount = 1 }: {
  control: WebView2Like;
  x: number;
  y: number;
  button?: MouseButton;
  clickCount?: number;
}) {
  function send(type: "mousePressed" | "mouseReleased") {
    return callDevToolsMethod({
      control,
      method: DISPATCH_MOUSE_EVENT,
      parameters: mouseEventParameters({
        type,
        x,
        y,
        button,
        clickCount
      })
    });
  }

  await Promise.all([send("mousePressed"), send("mouseReleased")]);
}

/**
 * Types `text` into the focused element with trusted key events, a character
 * at a time (the key down and up go out together, in order)
 */
export async function typeText({ control, text, mode = TypeMode.KEYS }: {
  control: WebView2Like;
  text: string;
  mode?: TypeMode;
}) {
  const characters = [...text];
  const isInsertingRest = mode === TypeMode.INSERT_AFTER_FIRST;
  const keyed = isInsertingRest ? characters.slice(0, 1) : characters;
  for (const character of keyed) {
    await Promise.all(
      [KeyEventType.KEY_DOWN, KeyEventType.KEY_UP].map(type => dispatchKey({
        control,
        key: character,
        type
      }))
    );
  }

  const rest = characters.slice(1).join("");
  const hasRest = isInsertingRest && rest !== "";
  if (hasRest) {
    await callDevToolsMethod({
      control,
      method: INSERT_TEXT,
      parameters: {
        text: rest
      }
    });
  }
}
