import type { CanvasElement } from "./canvas-element.ts";
import type { EventArguments } from "#src/components/convert.js";
import type { CanvasControlComponentProps } from "#src/components/generated/win2d/index.js";
import { isPointerArguments, pointerFields } from "#src/input/pointer-fields.js";
import type { PointerHandlerName } from "#src/input/pointer-routes.js";
import { POINTER_EVENT_TYPES } from "#src/input/pointer-routes.js";
import type { PointerRoutedEventArgs } from "#winui/microsoft/ui/xaml/input/PointerRoutedEventArgs";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";

// WinUI pointer events of the control a canvas is shown in, as the DOM events
// a drawing library listens for on a canvas element. A listener that calls
// `preventDefault` marks the WinUI event handled, so it goes no further up the
// tree (a wheel over the canvas does not scroll the ScrollViewer around it).

type PointerHandlers = Pick<CanvasControlComponentProps, PointerHandlerName>;

/** The pointer handlers an app passed to the component, each optional. */
export type UserPointerHandlers = {
  [Name in PointerHandlerName]?: PointerHandlers[Name] | undefined;
};

// A pointer event also has its mouse twin in the DOM.
const MOUSE_TWINS: Record<PointerHandlerName, string[]> = {
  onpointerpressed: ["mousedown"],
  onpointermoved: ["mousemove"],
  onpointerreleased: ["mouseup", "click"],
  onpointerentered: ["mouseenter", "pointerover", "mouseover"],
  onpointerexited: ["mouseleave", "pointerout", "mouseout"],
  onpointercanceled: [],
  onpointerwheelchanged: []
};

function forward({ name, canvas, element, user }: {
  name: PointerHandlerName;
  canvas: CanvasElement;
  element: () => UIElement | undefined;
  user: UserPointerHandlers;
}) {
  return (sender: UIElement, pointerArguments: EventArguments<PointerRoutedEventArgs>) => {
    const target = element();
    const isPointer = target !== undefined && isPointerArguments(pointerArguments);
    if (isPointer) {
      const fields = pointerFields({
        args: pointerArguments,
        element: target
      });
      let isPrevented = false;
      for (const type of [POINTER_EVENT_TYPES[name], ...MOUSE_TWINS[name]]) {
        const isAllowed = canvas.dispatchEvent({
          type,
          ...fields
        });
        isPrevented ||= !isAllowed;
      }

      if (isPrevented) {
        pointerArguments.handled = true;
      }
    }

    user[name]?.(sender, pointerArguments);
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
