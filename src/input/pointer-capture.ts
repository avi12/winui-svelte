import type { Pointer } from "#winui/microsoft/ui/xaml/input/Pointer";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";

// WinUI captures a Pointer object; the web captures by pointerId. The pointers
// an element has been told about (by its input events) stand between the two.

/** The part of a WinUI element pointer capture needs. */
export type CaptureControl = Pick<UIElement, "capturePointer" | "releasePointerCapture" | "pointerCaptures">;

const knownPointers = new WeakMap<object, Map<number, Pointer>>();

/**
 * Remembers a pointer an element's input event named, so the element can
 * capture it by id. `enableInputEvents` calls it for every pointer event.
 *
 * @param options - The element and the `pointer` of the event's arguments.
 */
export function rememberPointer({ control, pointer }: {
  control: object;
  pointer: Pointer;
}) {
  const pointers = knownPointers.get(control) ?? new Map<number, Pointer>();
  pointers.set(pointer.pointerId, pointer);
  knownPointers.set(control, pointers);
}

function pointerOf({ control, pointerId }: {
  control: object;
  pointerId: number;
}) {
  const pointer = knownPointers.get(control)?.get(pointerId);
  const isKnown = pointer !== undefined;
  if (!isKnown) {
    throw new Error(`Pointer ${pointerId} has not reached this element yet: capture it from a pointer event handler`);
  }

  return pointer;
}

/**
 * Sends every event of a pointer to the element until released, as the web's
 * `element.setPointerCapture(pointerId)` does. Call it in a pointerdown handler.
 *
 * @param options - The element and the `pointerId` of the event.
 * @returns True when WinUI took the capture.
 * @throws {Error} When the element has had no event from that pointer.
 */
export function setPointerCapture({ control, pointerId }: {
  control: CaptureControl;
  pointerId: number;
}) {
  return control.capturePointer(
    pointerOf({
      control,
      pointerId
    })
  );
}

/**
 * Gives a captured pointer back, as the web's `element.releasePointerCapture(pointerId)`.
 *
 * @param options - The element and the `pointerId`.
 * @throws {Error} When the element has had no event from that pointer.
 */
export function releasePointerCapture({ control, pointerId }: {
  control: CaptureControl;
  pointerId: number;
}) {
  control.releasePointerCapture(
    pointerOf({
      control,
      pointerId
    })
  );
}

/**
 * Tells whether the element has captured a pointer, as the web's `element.hasPointerCapture(pointerId)`.
 *
 * @param options - The element and the `pointerId`.
 * @returns True when the pointer is among the element's captures.
 */
export function hasPointerCapture({ control, pointerId }: {
  control: CaptureControl;
  pointerId: number;
}) {
  const captures = control.pointerCaptures;
  const size = captures?.size ?? 0;
  const pointers = Array.from({ length: size }, (_unused, iCapture) => captures?.getAt(iCapture));
  return pointers.some(pointer => pointer?.pointerId === pointerId);
}
