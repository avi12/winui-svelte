import { FrameworkElement, projectAs } from "#src/winui.js";
import { FocusManager } from "#winui/microsoft/ui/xaml/input/FocusManager";
import type { XamlRoot } from "#winui/microsoft/ui/xaml/XamlRoot";

/**
 * Projects what `FocusManager` names as focused to an element.
 *
 * @param focused - The focused object (`getFocusedElement()`, or an event's `newFocusedElement`).
 * @returns The element, or null when nothing is focused or it is no element (text inside a `RichTextBlock`).
 */
export function elementOf(focused: unknown) {
  const isFocused = typeof focused === "object" && focused !== null;
  if (!isFocused) {
    return null;
  }

  try {
    return projectAs(focused, FrameworkElement);
  } catch {
    return null;
  }
}

/**
 * Reads the element that has focus in a window. A desktop app must name the
 * window by its `XamlRoot`: asking without one finds nothing.
 *
 * @param xamlRoot - The `xamlRoot` of any element shown in the window.
 * @returns The focused element, or null.
 */
export function focusedElement(xamlRoot: XamlRoot | null) {
  const isShown = xamlRoot != null;
  return isShown ? elementOf(FocusManager.getFocusedElement(xamlRoot)) : null;
}
