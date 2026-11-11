import { InputPointerDeviceType } from "#winui/microsoft/ui/input/PointerDeviceType";
import type { InputPointerPoint } from "#winui/microsoft/ui/input/PointerPoint";
import { InputPointerUpdateKind } from "#winui/microsoft/ui/input/PointerUpdateKind";
import type { PointerRoutedEventArgs } from "#winui/microsoft/ui/xaml/input/PointerRoutedEventArgs";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";
import { VirtualKeyModifiers } from "#winui/windows/system/VirtualKeyModifiers";

// The one place a WinUI pointer event becomes the members of a DOM pointer
// event: winui-svelte/input reads it for elements, and the Canvas 2D of
// winui-svelte/win2d for the canvas it shows.

const PRIMARY_BUTTON = 0;
const MIDDLE_BUTTON = 1;
const SECONDARY_BUTTON = 2;
const NO_BUTTON = -1;
const BUTTON_MASKS = {
  left: 1,
  right: 2,
  middle: 4
} as const;

/** The kind of device a pointer event came from, as the web names it. */
export const PointerType = {
  mouse: "mouse",
  pen: "pen",
  touch: "touch"
} as const;

/** One of `PointerType`'s values. */
export type PointerType = (typeof PointerType)[keyof typeof PointerType];

// The button a pointer update is about: a release has no button pressed any more.
const UPDATE_BUTTONS = new Map<number, number>([
  [InputPointerUpdateKind.LeftButtonPressed, PRIMARY_BUTTON],
  [InputPointerUpdateKind.LeftButtonReleased, PRIMARY_BUTTON],
  [InputPointerUpdateKind.MiddleButtonPressed, MIDDLE_BUTTON],
  [InputPointerUpdateKind.MiddleButtonReleased, MIDDLE_BUTTON],
  [InputPointerUpdateKind.RightButtonPressed, SECONDARY_BUTTON],
  [InputPointerUpdateKind.RightButtonReleased, SECONDARY_BUTTON]
]);
const POINTER_TYPES = new Map<number, PointerType>([
  [InputPointerDeviceType.Touch, PointerType.touch],
  [InputPointerDeviceType.Pen, PointerType.pen],
  [InputPointerDeviceType.Mouse, PointerType.mouse],
  [InputPointerDeviceType.Touchpad, PointerType.mouse]
]);

/** The members of a DOM `PointerEvent` (and of the `WheelEvent` it is for the wheel) that WinUI knows. */
export interface PointerFields {
  readonly clientX: number;
  readonly clientY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly pageX: number;
  readonly pageY: number;
  readonly x: number;
  readonly y: number;
  readonly button: number;
  readonly buttons: number;
  readonly pointerId: number;
  readonly pointerType: PointerType;
  readonly isPrimary: boolean;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly twist: number;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaZ: number;
  readonly deltaMode: number;

  /**
   * The positions the pointer passed since the last event, oldest first,
   * ending with this one; empty on a coalesced event itself.
   */
  getCoalescedEvents(): PointerFields[];
}

/** The part of WinUI's `PointerRoutedEventArgs` the fields are read from. */
export type PointerArguments = Pick<PointerRoutedEventArgs, "keyModifiers" | "getCurrentPoint" | "getIntermediatePoints">;

function buttonOf({ isLeft, isRight, isMiddle }: {
  isLeft: boolean;
  isRight: boolean;
  isMiddle: boolean;
}) {
  if (isLeft) {
    return PRIMARY_BUTTON;
  }

  if (isMiddle) {
    return MIDDLE_BUTTON;
  }

  return isRight ? SECONDARY_BUTTON : NO_BUTTON;
}

function maskOf({ isLeft, isRight, isMiddle }: {
  isLeft: boolean;
  isRight: boolean;
  isMiddle: boolean;
}) {
  const left = isLeft ? BUTTON_MASKS.left : 0;
  const right = isRight ? BUTTON_MASKS.right : 0;
  const middle = isMiddle ? BUTTON_MASKS.middle : 0;
  return left | right | middle;
}

function noCoalescedEvents() {
  return [];
}

function fieldsOfPoint({ point, modifiers, getCoalescedEvents }: {
  point: InputPointerPoint;
  modifiers: number;
  getCoalescedEvents: () => PointerFields[];
}) {
  const properties = point.properties;
  const isLeft = properties.isLeftButtonPressed;
  const isRight = properties.isRightButtonPressed;
  const isMiddle = properties.isMiddleButtonPressed;
  const wheel = properties.mouseWheelDelta;
  const isHorizontal = properties.isHorizontalMouseWheel;
  const { x, y } = point.position;
  return {
    clientX: x,
    clientY: y,
    offsetX: x,
    offsetY: y,
    pageX: x,
    pageY: y,
    x,
    y,
    button: UPDATE_BUTTONS.get(properties.pointerUpdateKind) ?? buttonOf({
      isLeft,
      isRight,
      isMiddle
    }),
    buttons: maskOf({
      isLeft,
      isRight,
      isMiddle
    }),
    pointerId: point.pointerId,
    pointerType: POINTER_TYPES.get(point.pointerDeviceType) ?? PointerType.mouse,
    isPrimary: properties.isPrimary,
    pressure: properties.pressure,
    tiltX: properties.xTilt,
    tiltY: properties.yTilt,
    twist: properties.twist,
    ctrlKey: (modifiers & VirtualKeyModifiers.Control) !== 0,
    altKey: (modifiers & VirtualKeyModifiers.Menu) !== 0,
    shiftKey: (modifiers & VirtualKeyModifiers.Shift) !== 0,
    metaKey: (modifiers & VirtualKeyModifiers.Windows) !== 0,
    deltaX: isHorizontal ? wheel : 0,
    deltaY: isHorizontal ? 0 : -wheel,
    deltaZ: 0,
    deltaMode: 0,
    getCoalescedEvents
  } satisfies PointerFields;
}

/**
 * Reads the DOM members of a WinUI pointer event.
 *
 * @param options - The event's arguments, and the control the positions are relative to.
 * @returns The fields of a DOM pointer or wheel event; `getCoalescedEvents`
 *     reads the points WinUI collected since the last event.
 */
export function pointerFields({ args, element }: {
  args: PointerArguments;
  element: UIElement;
}) {
  const modifiers = args.keyModifiers;
  const current = fieldsOfPoint({
    point: args.getCurrentPoint(element),
    modifiers,
    getCoalescedEvents: noCoalescedEvents
  });
  function getCoalescedEvents() {
    const points = args.getIntermediatePoints(element);
    const size = points?.size ?? 0;
    const events = Array.from({ length: size }, (_unused, iEvent) => {
      const point = points?.getAt(size - 1 - iEvent);
      return point === undefined ? current : fieldsOfPoint({
        point,
        modifiers,
        getCoalescedEvents: noCoalescedEvents
      });
    });
    return events.length === 0 ? [current] : events;
  }

  return {
    ...current,
    getCoalescedEvents
  } satisfies PointerFields;
}
