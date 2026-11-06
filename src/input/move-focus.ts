import type { UIElement } from "#src/winui.js";
import { FindNextElementOptions } from "#winui/microsoft/ui/xaml/input/FindNextElementOptions";
import { FocusManager } from "#winui/microsoft/ui/xaml/input/FocusManager";
import { FocusNavigationDirection } from "#winui/microsoft/ui/xaml/input/FocusNavigationDirection";

const TAB_ORDER_DIRECTIONS = new Set<FocusNavigationDirection>([
  FocusNavigationDirection.Next,
  FocusNavigationDirection.Previous
]);

/**
 * Moves focus from the focused control to the nearest one in a direction: what
 * pressing an arrow key does with XY focus navigation, without a key press.
 * WinUI refuses `Next` and `Previous` (the Tab key's steps) in a desktop app,
 * so those throw; the Tab key itself, and `trapFocus`, are the ways there.
 *
 * @param options - `direction`: `FocusNavigationDirection.Up`, `Down`, `Left`
 *     or `Right`. `within`: a loaded element of the window to move in (WinUI
 *     searches from it; the sender of an event handler will do).
 * @returns True when focus moved; false when no control is that way.
 * @throws {Error} For `Next` and `Previous`.
 */
export function moveFocus({ direction, within }: {
  direction: FocusNavigationDirection;
  within: UIElement;
}) {
  const isTabOrder = TAB_ORDER_DIRECTIONS.has(direction);
  if (isTabOrder) {
    throw new Error("WinUI cannot move focus Next or Previous in a desktop app: use Up, Down, Left or Right");
  }

  const options = new FindNextElementOptions();
  options.searchRoot = within;
  return FocusManager.tryMoveFocus(direction, options);
}
