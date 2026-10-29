/** The part of a window `hideToTray` and `restoreFromTray` use; a `WindowHandle` has it. */
export interface TrayWindow {
  readonly appWindow: {
    readonly isVisible: boolean;
    isShownInSwitchers: boolean;
    hide(): void;
    show(): void;
  };
  bringToFront(): void;
}

/**
 * Hides the window and its taskbar button: what "minimize to tray" does. The
 * window keeps running; `restoreFromTray` brings it back.
 */
export function hideToTray(window: TrayWindow) {
  window.appWindow.isShownInSwitchers = false;
  window.appWindow.hide();
}

/** Undoes `hideToTray`: the taskbar button, the window, in front and focused. */
export function restoreFromTray(window: TrayWindow) {
  window.appWindow.isShownInSwitchers = true;
  window.appWindow.show();
  window.bringToFront();
}

/** Hides a visible window to the tray, or restores a hidden one: a tray click's usual job. */
export function toggleInTray(window: TrayWindow) {
  if (window.appWindow.isVisible) {
    hideToTray(window);
    return;
  }

  restoreFromTray(window);
}
