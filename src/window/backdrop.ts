import { write } from "#src/renderer/host/reflect.js";
import type { Window } from "#src/winui.js";
import { DesktopAcrylicBackdrop, MicaBackdrop, MicaKind } from "#src/winui.js";

/**
 * The material behind a window's content. Acrylic blurs and tints what is
 * behind the window; Mica tints with the desktop wallpaper (Mica Alt more
 * strongly, as a tabbed title bar has it); none leaves the theme's solid color.
 */
export const Backdrop = {
  acrylic: "acrylic",
  mica: "mica",
  micaAlt: "micaAlt",
  none: "none"
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

/** Puts `backdrop` behind `window`'s content, replacing the one it had. */
export function applyBackdrop({ window, backdrop }: {
  window: Window;
  backdrop: Backdrop;
}) {
  const systemBackdrop = systemBackdropFor(backdrop);
  const isRemoved = systemBackdrop === null;
  if (isRemoved) {
    // The binding types the property as non-null, but null is how WinUI takes
    // a backdrop away.
    write(window, "systemBackdrop", null);
    return;
  }

  window.systemBackdrop = systemBackdrop;
}
