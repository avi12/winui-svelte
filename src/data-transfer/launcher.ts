import { Uri } from "#src/winui.js";
import { StorageFile } from "#winui/windows/storage/StorageFile";
import { Launcher } from "#winui/windows/system/Launcher";
import { spawn } from "node:child_process";

/**
 * Opens a link in the app Windows has for it: the browser for `https:`, the
 * mail app for `mailto:`, and so on.
 *
 * @param url - The address, with its scheme.
 * @returns True when Windows started something.
 */
export function launchUri(url: string) {
  return Launcher.launchUriAsync(new Uri(url));
}

/**
 * Opens a file with the app Windows has for its type, as double-clicking it
 * in Explorer does.
 *
 * @param path - The full path of the file.
 * @returns True when Windows started something.
 */
export async function launchFile(path: string) {
  return Launcher.launchFileAsync(await StorageFile.getFileFromPathAsync(path));
}

/**
 * Opens a folder in Explorer.
 *
 * @param path - The full path of the folder.
 * @returns True when Explorer opened it.
 */
export function openFolder(path: string) {
  return Launcher.launchFolderPathAsync(path);
}

/**
 * Opens Explorer on the folder of a file with the file selected (or on a
 * folder with the folder selected in its parent). The selection is not in the
 * Launcher's API for a plain path, so this starts `explorer.exe /select`.
 *
 * @param path - The full path of the file or folder.
 */
export function revealInExplorer(path: string) {
  const child = spawn("explorer.exe", [`/select,${path}`], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}
