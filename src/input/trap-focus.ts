import { elementOf, focusedElement } from "./focused-element.ts";
import { control } from "#src/renderer/host/control.js";
import { FocusState } from "#src/winui.js";
import type { FrameworkElement } from "#src/winui.js";
import { FocusManager } from "#winui/microsoft/ui/xaml/input/FocusManager";
import { KeyboardNavigationMode } from "#winui/microsoft/ui/xaml/input/KeyboardNavigationMode";

/** What `trapFocus` takes. */
export interface TrapFocusOptions {

  /** Move focus to the first control inside when the trap starts. Default true. */
  shouldFocusFirst?: boolean;
}

function noStop() {
  // Nothing was subscribed.
}

/**
 * Keeps keyboard focus inside an element, for a dialog or a wizard step:
 * `@attach trapFocus()` on the element. Tab after the last control goes to
 * the first and Shift+Tab before the first to the last (the element's
 * `TabFocusNavigation` is `Cycle`). Focus moves in when the element is
 * shown, and when the element goes, to where it was before; the element's
 * own `TabFocusNavigation` comes back too.
 *
 * @param options - Whether focus moves in to start with.
 * @returns The attachment to put after `@attach`.
 */
export function trapFocus({ shouldFocusFirst = true }: TrapFocusOptions = {}) {
  return control<FrameworkElement>(container => {
    const previousNavigation = container.tabFocusNavigation;
    let previousFocus = focusedElement(container.xamlRoot);
    function start() {
      previousFocus = focusedElement(container.xamlRoot);

      if (shouldFocusFirst) {
        elementOf(FocusManager.findFirstFocusableElement(container))?.focus(FocusState.Programmatic);
      }
    }

    container.tabFocusNavigation = KeyboardNavigationMode.Cycle;
    let stopLoaded = noStop;
    if (container.isLoaded) {
      start();
    } else {
      stopLoaded = container.onceLoaded(start);
    }

    return () => {
      stopLoaded();
      container.tabFocusNavigation = previousNavigation;
      previousFocus?.focus(FocusState.Programmatic);
    };
  });
}
