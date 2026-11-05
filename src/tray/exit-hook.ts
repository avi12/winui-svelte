import { removeAllTrayIcons } from "./tray-core.ts";

let isExitHooked = false;

/** Removes every tray icon at process exit, once however many icons are made. */
export function removeTrayIconsAtExit() {
  if (isExitHooked) {
    return;
  }

  isExitHooked = true;
  process.once("exit", removeAllTrayIcons);
}
