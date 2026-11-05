// The WinUI pointer events and the DOM event each one is, the one table the
// elements of winui-svelte/input and the Canvas 2D of winui-svelte/win2d read.

/** The WinUI pointer handler props, each with the DOM event type it raises. */
export const POINTER_EVENT_TYPES = {
  onpointerpressed: "pointerdown",
  onpointermoved: "pointermove",
  onpointerreleased: "pointerup",
  onpointerentered: "pointerenter",
  onpointerexited: "pointerleave",
  onpointercanceled: "pointercancel",
  onpointerwheelchanged: "wheel"
} as const;

/** The name of a WinUI pointer handler prop. */
export type PointerHandlerName = keyof typeof POINTER_EVENT_TYPES;
