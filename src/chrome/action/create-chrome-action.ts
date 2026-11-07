import { ChromeAction } from "./chrome-action.ts";
import type { ActionTray } from "./chrome-action.ts";
import type { TrayIconHandle, TrayIconOptions } from "#src/tray/tray-core.js";
import { createTrayIcon } from "#src/tray/tray-icon.js";

/** What `createChromeAction` takes. */
export interface CreateChromeActionOptions extends Omit<TrayIconOptions, "onclick" | "tooltip"> {
  /** The title (the tooltip) to start with. */
  readonly title?: string | undefined;

  /** Makes the tray icon; `createTrayIcon` by default, a test gives a fake. */
  readonly createTray?: ((options: TrayIconOptions) => TrayIconHandle & ActionTray) | undefined;
}

/**
 * Puts an icon in the tray and returns the `chrome.action` that drives it. Call
 * it on the UI thread. `ondoubleclick`, `oncontextmenu` and `onmiddleclick` go
 * to the tray as they are; the left click is `onClicked`.
 *
 * @param options - The tray icon's options, and the starting title.
 * @returns The action and the tray icon, which the caller removes.
 */
export function createChromeAction(options: CreateChromeActionOptions) {
  const { title, createTray = createTrayIcon, ...trayOptions } = options;
  const action = new ChromeAction({ title });
  const tray = createTray({
    ...trayOptions,
    onclick: () => action.click()
  });
  action.attach(tray);
  return {
    action,
    tray
  };
}
