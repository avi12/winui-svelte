// The `cursor` property of the CSS part, apart from the entry (index.ts) so a
// window's bundle carries it only when a sheet uses it: the module a compiled
// sheet imports when it has one.

import type { CursorHost } from "./translate/cursor-properties.ts";
import { cursorGroups as groupsWith } from "./translate/cursor-properties.ts";
import { read, write } from "#src/renderer/host/reflect.js";
import { projectAs } from "#winui/lifetime";
import { InputCursor } from "#winui/microsoft/ui/input/InputCursor";
import { InputSystemCursor } from "#winui/microsoft/ui/input/InputSystemCursor";
import { InputSystemCursorShape } from "#winui/microsoft/ui/input/InputSystemCursorShape";
import { IUIElementProtected } from "#winui/microsoft/ui/xaml/IUIElementProtected";

// UIElement.ProtectedCursor is a protected member, but protection is a C#
// rule: the property is on the IUIElementProtected interface of every
// UIElement, which projectAs reaches by QueryInterface from outside.
const PROTECTED_CURSOR = "protectedCursor";
// The class wrapper keeps its native value here; the interface is cast from that.
const NATIVE_OBJECT = "_obj";

const cursors = new Map<string, InputCursor>();
function cursorOf(name: string) {
  const known = cursors.get(name);
  const isKnown = known !== undefined;
  if (isKnown) {
    return known;
  }

  const shape = Object.entries(InputSystemCursorShape).find(([shapeName]) => shapeName === name)?.[1];
  const isUnknown = shape === undefined;
  if (isUnknown) {
    throw new RangeError(`${name} is not an InputSystemCursorShape`);
  }

  const made = projectAs(InputSystemCursor.create(shape), InputCursor);
  cursors.set(name, made);
  return made;
}

const nativeCursorHost = {
  setCursor({ control, shape }) {
    const element = IUIElementProtected.from(read(control, NATIVE_OBJECT));
    write(element, PROTECTED_CURSOR, shape === null ? null : cursorOf(shape));
  }
} satisfies CursorHost;

/** The group of `cursor`, showing the shape with the element's ProtectedCursor. */
export function cursorGroups() {
  return groupsWith(nativeCursorHost);
}
