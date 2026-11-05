import { AcrylicVariant, attachAcrylic } from "./acrylic-controller.ts";
import { attachTransparentBackdrop } from "./transparent-backdrop.ts";
import { write } from "#src/renderer/host/reflect.js";
import type { FrameworkElement, Window } from "#src/winui.js";
import { DesktopAcrylicBackdrop, MicaBackdrop, MicaKind } from "#src/winui.js";

/**
 * The material behind a window's content. Acrylic blurs and tints what is
 * behind the window (`acrylicBase` and `acrylicThin` are its other two
 * variants, made by the system backdrop controller); Mica tints with the desktop wallpaper (Mica Alt more
 * strongly, as a tabbed title bar has it); transparent shows the desktop
 * through every pixel the content leaves clear (with per-pixel alpha; pair it
 * with `isBorderless`); none leaves the theme's solid color.
 */
export const Backdrop = {
  acrylic: "acrylic",
  acrylicBase: "acrylicBase",
  acrylicThin: "acrylicThin",
  mica: "mica",
  micaAlt: "micaAlt",
  none: "none",
  transparent: "transparent"
} as const;

/** One of `Backdrop`'s values. */
export type Backdrop = (typeof Backdrop)[keyof typeof Backdrop];

// A new backdrop each time: WinUI ties one to the window that holds it.
function systemBackdropFor(backdrop: Backdrop) {
  switch (backdrop) {
    case Backdrop.acrylic: {
      return new DesktopAcrylicBackdrop();
    }
    case Backdrop.mica: {
      return new MicaBackdrop();
    }
    case Backdrop.micaAlt: {
      const micaAlt = new MicaBackdrop();
      micaAlt.kind = MicaKind.BaseAlt;
      return micaAlt;
    }
    default: {
      return null;
    }
  }
}

// The backdrops the system backdrop controller makes, not XAML.
const controllerVariants = new Map<Backdrop, AcrylicVariant>([
  [Backdrop.acrylicBase, AcrylicVariant.base],
  [Backdrop.acrylicThin, AcrylicVariant.thin]
]);

function releaseNothing() {
  // A XAML backdrop is let go by the next one replacing it.
}

/**
 * Puts `backdrop` behind `window`'s content, replacing the one it had.
 *
 * @returns What takes it away again (the controller of a controller backdrop
 * has to be closed; call it before applying another).
 */
export function applyBackdrop({ window, content, backdrop }: {
  window: Window;
  content: FrameworkElement;
  backdrop: Backdrop;
}) {
  const variant = controllerVariants.get(backdrop);
  const isControlled = variant !== undefined;
  const isTransparent = backdrop === Backdrop.transparent;
  const systemBackdrop = isControlled ? null : systemBackdropFor(backdrop);
  const isRemoved = systemBackdrop === null;
  if (isRemoved) {
    // The binding types the property as non-null, but null is how WinUI takes
    // a backdrop away.
    write(window, "systemBackdrop", null);
  } else {
    window.systemBackdrop = systemBackdrop;
  }

  if (isTransparent) {
    return attachTransparentBackdrop(window);
  }

  if (isControlled) {
    return attachAcrylic({
      window,
      content,
      variant
    });
  }

  return releaseNothing;
}
