import type { KeyboardFields } from "./keyboard-fields.ts";
import type { PointerFields } from "./pointer-fields.ts";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";

/** The members every web event has, which a WinUI event carries too. */
export interface DomEvent {
  readonly type: string;

  /** The element the event started at, as `originalSource` says; the element it is heard on when WinUI names none. */
  readonly target: UIElement;

  /** The element the handler is written on. */
  readonly currentTarget: UIElement;
  readonly defaultPrevented: boolean;
  readonly timeStamp: number;

  /**
   * Marks the WinUI event handled, so it goes no further up the tree and the
   * control's own handling (the Tab key moving focus) is skipped.
   */
  preventDefault(): void;

  /** The same as `preventDefault`: WinUI has one flag for both. */
  stopPropagation(): void;
}

type WheelFieldName = "deltaX" | "deltaY" | "deltaZ" | "deltaMode";

/**
 * The web's `PointerEvent`: `pointerdown`, `pointerup`, `pointermove`,
 * `pointerenter`, `pointerleave` and `pointercancel`.
 */
export interface PointerEvent extends DomEvent, Omit<PointerFields, WheelFieldName> {}

/** The web's `WheelEvent`: `deltaY` is positive when the wheel turns toward the user, as on the web. */
export interface WheelEvent extends PointerEvent, Pick<PointerFields, WheelFieldName> {}

/** The web's `KeyboardEvent`: `keydown` and `keyup`. */
export interface KeyboardEvent extends DomEvent, KeyboardFields {}

/** The web's `FocusEvent`: `focusin` and `focusout`. It cannot be cancelled, and has no `relatedTarget`. */
export interface FocusEvent {
  readonly type: string;
  readonly target: UIElement;
  readonly currentTarget: UIElement;
  readonly timeStamp: number;
}

/** The web's input event names, each with the event it hands the handler. */
export interface InputEventMap {
  pointerdown: PointerEvent;
  pointerup: PointerEvent;
  pointermove: PointerEvent;
  pointerenter: PointerEvent;
  pointerleave: PointerEvent;
  pointercancel: PointerEvent;
  wheel: WheelEvent;
  keydown: KeyboardEvent;
  keyup: KeyboardEvent;
  focusin: FocusEvent;
  focusout: FocusEvent;
}

/** One of the web's input event names. */
export type InputEventType = keyof InputEventMap;

/** The part of a WinUI event's arguments the web event reads its target from. */
export interface RoutedSource {
  readonly originalSource?: unknown;
}

function isElement(value: unknown): value is UIElement {
  return typeof value === "object" && value !== null;
}

/**
 * The element a WinUI event started at.
 *
 * @param options - The arguments of the event and the element the handler is on.
 * @returns `originalSource` when WinUI names an element, otherwise the handler's element.
 */
export function targetOf({ args, control }: {
  args: RoutedSource;
  control: UIElement;
}) {
  const source = args.originalSource;
  return isElement(source) ? source : control;
}

/**
 * Makes a web event from a WinUI event.
 *
 * @param options - The type, the fields, where the handler is, and what `preventDefault` does to the WinUI event.
 * @returns The event, with `fields` spread in.
 */
export function createDomEvent<Fields extends object>({ type, fields, target, currentTarget, onPrevent }: {
  type: string;
  fields: Fields;
  target: UIElement;
  currentTarget: UIElement;
  onPrevent: () => void;
}) {
  let isPrevented = false;
  function prevent() {
    isPrevented = true;
    onPrevent();
  }

  return {
    ...fields,
    type,
    target,
    currentTarget,
    timeStamp: performance.now(),
    get defaultPrevented() {
      return isPrevented;
    },
    preventDefault: prevent,
    stopPropagation: prevent
  };
}
