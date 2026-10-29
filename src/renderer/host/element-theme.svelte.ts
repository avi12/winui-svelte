import type { NodeAttachment } from "./control.ts";
import { control } from "./control.ts";
import type { ElementTheme, FrameworkElement } from "#src/winui.js";

/**
 * The theme one element is drawn in, light or dark, for a layout or a custom
 * drawing that follows it. Put `theme.attach` after `@attach` on the element
 * and read `theme.current` (`ElementTheme.Light` or `ElementTheme.Dark`),
 * which is reactive: it follows the element's requested theme, its parents'
 * and the system's. It is undefined until the element is made and after it goes.
 */
export interface ElementThemeReader {
  readonly current: ElementTheme | undefined;
  readonly attach: NodeAttachment;
}

/**
 * Makes a reactive reader of one element's `ActualTheme`, kept current by the
 * element's `ActualThemeChanged` event.
 *
 * @returns The reader: `attach` goes on the element, `current` is read where the theme is needed.
 */
export function elementTheme() {
  let current = $state<ElementTheme>();
  const attach = control<FrameworkElement>(element => {
    current = element.actualTheme;
    const stop = element.onActualThemeChanged(() => {
      current = element.actualTheme;
    });
    return () => {
      stop();
      current = undefined;
    };
  });
  return {
    get current() {
      return current;
    },
    attach
  };
}
