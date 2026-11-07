import { ChromeWindows } from "./chrome-windows.ts";
import type { ChromeWindowsOptions } from "./chrome-windows.ts";

/**
 * Makes the `chrome.windows` of an app. Call it once and share the result:
 * the windows it knows, and their ids, live in it.
 *
 * @param options - How `create` opens a window.
 * @returns The namespace.
 */
export function createChromeWindows(options: ChromeWindowsOptions = {}) {
  return new ChromeWindows(options);
}
