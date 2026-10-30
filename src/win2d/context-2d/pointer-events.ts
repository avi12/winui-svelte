import type { CanvasElement } from "./canvas-element.ts";
import type { CanvasControlComponentProps } from "#src/components/generated/win2d/index.js";
import { InputPointerDeviceType } from "#winui/microsoft/ui/input/PointerDeviceType";
import { InputPointerUpdateKind } from "#winui/microsoft/ui/input/PointerUpdateKind";
import type { PointerRoutedEventArgs } from "#winui/microsoft/ui/xaml/input/PointerRoutedEventArgs";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";
import { VirtualKeyModifiers } from "#winui/windows/system/VirtualKeyModifiers";

// WinUI pointer events of the control a canvas is shown in, as the DOM events
// a drawing library listens for on a canvas element.

const PRIMARY_BUTTON = 0;
const MIDDLE_BUTTON = 1;
const SECONDARY_BUTTON = 2;
const NO_BUTTON = -1;
const BUTTON_MASKS = {
  left: 1,
  right: 2,
  middle: 4
} as const;
// The button a pointer update is about: a release has no button pressed any more.
const UPDATE_BUTTONS = new Map<number, number>([
  [InputPointerUpdateKind.LeftButtonPressed, PRIMARY_BUTTON],
  [InputPointerUpdateKind.LeftButtonReleased, PRIMARY_BUTTON],
  [InputPointerUpdateKind.MiddleButtonPressed, MIDDLE_BUTTON],
  [InputPointerUpdateKind.MiddleButtonReleased, MIDDLE_BUTTON],
  [InputPointerUpdateKind.RightButtonPressed, SECONDARY_BUTTON],
  [InputPointerUpdateKind.RightButtonReleased, SECONDARY_BUTTON]
]);
const POINTER_TYPES = new Map<number, string>([
  [InputPointerDeviceType.Touch, "touch"],
  [InputPointerDeviceType.Pen, "pen"],
  [InputPointerDeviceType.Mouse, "mouse"],
  [InputPointerDeviceType.Touchpad, "mouse"]
]);

/** The handler props of the control that the canvas listens through. */
export type PointerHandlerName = "onpointerpressed" | "onpointermoved" | "onpointerreleased" | "onpointerentered" | "onpointerexited" | "onpointercanceled" | "onpointerwheelchanged";

type PointerHandler = (...args: unknown[]) => void;

/** The pointer handlers an app passed to the component, each optional. */
export type UserPointerHandlers = {
  [Name in PointerHandlerName]?: PointerHandler | undefined;
};

type PointerHandlers = Pick<CanvasControlComponentProps, PointerHandlerName>;

// What each WinUI event is called in the DOM; a pointer event also has its mouse twin.
const EVENT_TYPES: Record<PointerHandlerName, string[]> = {
  onpointerpressed: ["pointerdown", "mousedown"],
  onpointermoved: ["pointermove", "mousemove"],
  onpointerreleased: ["pointerup", "mouseup", "click"],
  onpointerentered: ["pointerenter", "mouseenter", "pointerover", "mouseover"],
  onpointerexited: ["pointerleave", "mouseleave", "pointerout", "mouseout"],
  onpointercanceled: ["pointercancel"],
  onpointerwheelchanged: ["wheel"]
};

function isPointerArguments(value: unknown): value is PointerRoutedEventArgs {
  return typeof value === "object" && value !== null && "getCurrentPoint" in value;
}

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

function eventFields({ args, element }: {
  args: PointerRoutedEventArgs;
  element: UIElement;
}) {
  const point = args.getCurrentPoint(element);
  const properties = point.properties;
  const isLeft = properties.isLeftButtonPressed;
  const isRight = properties.isRightButtonPressed;
  const isMiddle = properties.isMiddleButtonPressed;
  const modifiers = args.keyModifiers;
  const wheel = properties.mouseWheelDelta;
  const isHorizontal = properties.isHorizontalMouseWheel;
  return {
    clientX: point.position.x,
    clientY: point.position.y,
    offsetX: point.position.x,
    offsetY: point.position.y,
    pageX: point.position.x,
    pageY: point.position.y,
    x: point.position.x,
    y: point.position.y,
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
    pointerType: POINTER_TYPES.get(point.pointerDeviceType) ?? "mouse",
    isPrimary: properties.isPrimary,
    pressure: properties.pressure,
    ctrlKey: (modifiers & VirtualKeyModifiers.Control) !== 0,
    altKey: (modifiers & VirtualKeyModifiers.Menu) !== 0,
    shiftKey: (modifiers & VirtualKeyModifiers.Shift) !== 0,
    metaKey: (modifiers & VirtualKeyModifiers.Windows) !== 0,
    deltaX: isHorizontal ? wheel : 0,
    deltaY: isHorizontal ? 0 : -wheel,
    deltaZ: 0,
    deltaMode: 0
  };
}

function forward({ name, canvas, element, user }: {
  name: PointerHandlerName;
  canvas: CanvasElement;
  element: () => UIElement | undefined;
  user: UserPointerHandlers;
}) {
  return (...args: unknown[]) => {
    const target = element();
    const [, pointerArguments] = args;
    const isPointer = target !== undefined && isPointerArguments(pointerArguments);
    if (isPointer) {
      const fields = eventFields({
        args: pointerArguments,
        element: target
      });
      for (const type of EVENT_TYPES[name]) {
        canvas.dispatchEvent({
          type,
          ...fields
        });
      }
    }

    user[name]?.(...args);
  };
}

/**
 * The pointer handler props for a control that shows a canvas: each raises the
 * DOM events of the canvas, then calls the handler the app passed, if any.
 * `element` is the control, which the pointer positions are relative to.
 */
export function pointerHandlers({ canvas, element, user }: {
  canvas: CanvasElement;
  element: () => UIElement | undefined;
  user: UserPointerHandlers;
}) {
  function handler(name: PointerHandlerName) {
    return forward({
      name,
      canvas,
      element,
      user
    });
  }

  return {
    onpointerpressed: handler("onpointerpressed"),
    onpointermoved: handler("onpointermoved"),
    onpointerreleased: handler("onpointerreleased"),
    onpointerentered: handler("onpointerentered"),
    onpointerexited: handler("onpointerexited"),
    onpointercanceled: handler("onpointercanceled"),
    onpointerwheelchanged: handler("onpointerwheelchanged")
  } satisfies PointerHandlers;
}
