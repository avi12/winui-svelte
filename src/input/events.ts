import type {
  FocusEvent,
  InputEventType,
  KeyboardEvent,
  PointerEvent,
  RoutedSource,
  WheelEvent
} from "./dom-event.ts";
import { createDomEvent, targetOf } from "./dom-event.ts";
import { keyboardFields } from "./keyboard-fields.ts";
import { rememberPointer } from "./pointer-capture.ts";
import { pointerFields } from "./pointer-fields.ts";
import { withProjected } from "./projected-arguments.ts";
import type { NativeValue } from "#src/native-value.js";
import type { EventAdapter } from "#src/renderer/host/event-adapters.js";
import { eventAdapters } from "#src/renderer/host/event-adapters.js";
import { KeyRoutedEventArgs } from "#winui/microsoft/ui/xaml/input/KeyRoutedEventArgs";
import { PointerRoutedEventArgs } from "#winui/microsoft/ui/xaml/input/PointerRoutedEventArgs";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";

// The web's pointer, wheel, keyboard and focus event names on raw elements.
// Each name is wired to a WinUI event of the control, and the handler gets the
// web's event built from the WinUI arguments.

type Listener = (sender: unknown, args: unknown) => void;

interface Route<Event> {
  /** Gives `use` the event's arguments as the class the route reads. */
  withArguments(options: {
    args: unknown;
    use: (ready: unknown) => void;
  }): void;
  subscribe(options: {
    control: UIElement;
    listener: Listener;
  }): () => void;
  makeEvent(options: {
    control: UIElement;
    args: unknown;
    onPrevent: () => void;
  }): Event | undefined;
}

function isPointerArguments(value: unknown): value is PointerRoutedEventArgs {
  return typeof value === "object" && value !== null && "getCurrentPoint" in value && "pointer" in value;
}

function isKeyArguments(value: unknown): value is KeyRoutedEventArgs {
  return typeof value === "object" && value !== null && "keyStatus" in value;
}

function isSource(value: unknown): value is RoutedSource {
  return typeof value === "object" && value !== null;
}

function sourceOf(args: unknown) {
  return isSource(args) ? args : {};
}

function markHandled(args: unknown) {
  const isRouted = isKeyArguments(args) || isPointerArguments(args);
  if (isRouted) {
    args.handled = true;
  }
}

function pointerEventOf({ type, control, args, onPrevent }: {
  type: string;
  control: UIElement;
  args: unknown;
  onPrevent: () => void;
}) {
  if (!isPointerArguments(args)) {
    return undefined;
  }

  rememberPointer({
    control,
    pointer: args.pointer
  });
  return createDomEvent({
    type,
    fields: pointerFields({
      args,
      element: control
    }),
    target: targetOf({
      args,
      control
    }),
    currentTarget: control,
    onPrevent
  });
}

function readPointerArguments({ args, use }: {
  args: unknown;
  use: (ready: unknown) => void;
}) {
  withProjected({
    args,
    projection: PointerRoutedEventArgs,
    member: "getCurrentPoint",
    use
  });
}

function pointerRoute({ type, subscribe }: {
  type: string;
  subscribe: Route<PointerEvent>["subscribe"];
}) {
  return {
    subscribe,
    withArguments: readPointerArguments,
    makeEvent: options => pointerEventOf({
      type,
      ...options
    })
  } satisfies Route<PointerEvent>;
}

function wheelRoute({ subscribe }: {
  subscribe: Route<WheelEvent>["subscribe"];
}) {
  return {
    subscribe,
    withArguments: readPointerArguments,
    makeEvent: options => pointerEventOf({
      type: "wheel",
      ...options
    })
  } satisfies Route<WheelEvent>;
}

function keyRoute({ type, subscribe }: {
  type: string;
  subscribe: Route<KeyboardEvent>["subscribe"];
}) {
  return {
    subscribe,
    withArguments({ args, use }) {
      withProjected({
        args,
        projection: KeyRoutedEventArgs,
        member: "keyStatus",
        use
      });
    },
    makeEvent({ control, args, onPrevent }) {
      if (!isKeyArguments(args)) {
        return undefined;
      }

      return createDomEvent({
        type,
        fields: keyboardFields({ args }),
        target: targetOf({
          args,
          control
        }),
        currentTarget: control,
        onPrevent
      });
    }
  } satisfies Route<KeyboardEvent>;
}

function focusRoute({ type, subscribe }: {
  type: string;
  subscribe: Route<FocusEvent>["subscribe"];
}) {
  return {
    subscribe,
    withArguments({ args, use }) {
      use(args);
    },
    makeEvent({ control, args }) {
      return {
        type,
        target: targetOf({
          args: sourceOf(args),
          control
        }),
        currentTarget: control,
        timeStamp: performance.now()
      };
    }
  } satisfies Route<FocusEvent>;
}

function adapterOf<Event>(route: Route<Event>) {
  function isHandler(value: NativeValue): value is (event: Event) => void {
    return typeof value === "function";
  }

  return {
    subscribe({ control, handler }) {
      if (!isHandler(handler)) {
        return () => undefined;
      }

      return route.subscribe({
        control,
        listener(_sender, args) {
          route.withArguments({
            args,
            use(ready) {
              const event = route.makeEvent({
                control,
                args: ready,
                onPrevent: () => markHandled(ready)
              });
              const isBuilt = event !== undefined;
              if (isBuilt) {
                handler(event);
              }
            }
          });
        }
      });
    }
  } satisfies EventAdapter;
}

const INPUT_ADAPTERS = {
  pointerdown: adapterOf(
    pointerRoute({
      type: "pointerdown",
      subscribe: ({ control, listener }) => control.onPointerPressed(listener)
    })
  ),
  pointerup: adapterOf(
    pointerRoute({
      type: "pointerup",
      subscribe: ({ control, listener }) => control.onPointerReleased(listener)
    })
  ),
  pointermove: adapterOf(
    pointerRoute({
      type: "pointermove",
      subscribe: ({ control, listener }) => control.onPointerMoved(listener)
    })
  ),
  pointerenter: adapterOf(
    pointerRoute({
      type: "pointerenter",
      subscribe: ({ control, listener }) => control.onPointerEntered(listener)
    })
  ),
  pointerleave: adapterOf(
    pointerRoute({
      type: "pointerleave",
      subscribe: ({ control, listener }) => control.onPointerExited(listener)
    })
  ),
  pointercancel: adapterOf(
    pointerRoute({
      type: "pointercancel",
      subscribe: ({ control, listener }) => control.onPointerCanceled(listener)
    })
  ),
  wheel: adapterOf(
    wheelRoute({
      subscribe: ({ control, listener }) => control.onPointerWheelChanged(listener)
    })
  ),
  keydown: adapterOf(
    keyRoute({
      type: "keydown",
      subscribe: ({ control, listener }) => control.onKeyDown(listener)
    })
  ),
  keyup: adapterOf(
    keyRoute({
      type: "keyup",
      subscribe: ({ control, listener }) => control.onKeyUp(listener)
    })
  ),
  focusin: adapterOf(
    focusRoute({
      type: "focusin",
      subscribe: ({ control, listener }) => control.onGotFocus(listener)
    })
  ),
  focusout: adapterOf(
    focusRoute({
      type: "focusout",
      subscribe: ({ control, listener }) => control.onLostFocus(listener)
    })
  )
} satisfies Record<InputEventType, EventAdapter>;

/**
 * Makes the web's input event names work on elements: `onpointerdown`,
 * `onpointerup`, `onpointermove`, `onpointerenter`, `onpointerleave`,
 * `onpointercancel`, `onwheel`, `onkeydown`, `onkeyup`, `onfocusin` and
 * `onfocusout`, written as in HTML, for example
 * `<border onpointerdown={event => ...}>`. The handler gets a `PointerEvent`,
 * `WheelEvent`, `KeyboardEvent` or `FocusEvent`. Call it once at start-up,
 * before the first window. On a raw element it changes `onkeydown` from
 * WinUI's arguments to the web's; components keep their WinUI props, and so
 * does any WinUI-named event (`onpointerpressed`).
 */
export function enableInputEvents() {
  for (const [type, adapter] of Object.entries(INPUT_ADAPTERS)) {
    eventAdapters.set(type, adapter);
  }
}
