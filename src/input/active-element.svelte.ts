import { elementOf } from "./focused-element.ts";
import type { FrameworkElement } from "#src/winui.js";
import { FocusManager } from "#winui/microsoft/ui/xaml/input/FocusManager";

/** The element that has keyboard focus, as `document.activeElement` is on the web. */
export interface ActiveElement {

  /**
   * The focused element, or null when none of the app's controls has focus
   * (or the focus is on text inside a `RichTextBlock`, which is no element).
   * Reactive.
   */
  readonly current: FrameworkElement | null;
}

/**
 * Makes a reactive reader of the focused element, kept current by
 * `FocusManager`'s `GotFocus` and `LostFocus`. Call it while a component is
 * initialised: it stops listening when the component goes. It is null until
 * focus first moves after that.
 *
 * @returns The reader; read `current` where the focus decides something.
 */
export function activeElement() {
  let current = $state<FrameworkElement | null>(null);
  $effect(() => {
    const gotToken = FocusManager.add_GotFocus((_sender, args) => {
      current = elementOf(args.newFocusedElement);
    });
    const lostToken = FocusManager.add_LostFocus(() => {
      current = null;
    });
    return () => {
      FocusManager.remove_GotFocus(gotToken);
      FocusManager.remove_LostFocus(lostToken);
      current = null;
    };
  });
  return {
    get current() {
      return current;
    }
  } satisfies ActiveElement;
}
