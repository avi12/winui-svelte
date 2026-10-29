import type { WindowHandle } from "winui-svelte/components";
import type { Backdrop, WindowPresentation, WindowTheme } from "winui-svelte/window";

/** What the gallery's window shows, which the window page edits. */
class Shell {
  title = $state("winui-svelte gallery");
  backdrop = $state<Backdrop>("mica");
  theme = $state<WindowTheme>("system");
  presentation = $state<WindowPresentation>("windowed");
  isCloseBlocked = $state(false);
  handle = $state<WindowHandle>();
}

export const shell = new Shell();
