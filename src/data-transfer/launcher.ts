import { bringWindowToFront } from "#src/win32-foreground.js";
import { Uri } from "#src/winui.js";
import { StorageFile } from "#winui/windows/storage/StorageFile";
import { Launcher } from "#winui/windows/system/Launcher";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

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

const EXPLORER_TARGET_VARIABLE = "WINUI_SVELTE_EXPLORER_TARGET";
const FIND_TIMEOUT_MILLISECONDS = 8000;
// Explorer's own windows are listed through the Shell's automation object, the only place that
// says which folder each shows. The item is selected as a click would (1 select, 4 deselect the
// rest, 8 scroll to it, 16 focus); the window's handle is printed for the caller to bring up.
const FIND_WINDOW_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$target = $env:${EXPLORER_TARGET_VARIABLE}
$parent = Split-Path -Parent $target
$windows = @((New-Object -ComObject Shell.Application).Windows())
function FolderOf($window) { try { $window.Document.Folder.Self.Path } catch { $null } }
foreach ($window in $windows) {
  if ((FolderOf $window) -ieq $parent) {
    $item = $window.Document.Folder.ParseName((Split-Path -Leaf $target))
    if ($item) { $window.Document.SelectItem($item, 29) }
    $window.HWND
    exit 0
  }
}
foreach ($window in $windows) {
  if ((FolderOf $window) -ieq $target) { $window.HWND; exit 0 }
}
`;

function startExplorerSelecting(path: string) {
  const child = spawn("explorer.exe", [`/select,${path}`], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}

// Brings the Explorer window that already shows the item's folder (or the folder itself) to the front.
async function focusOpenExplorerWindow(path: string) {
  const { stdout } = await promisify(execFile)(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", FIND_WINDOW_SCRIPT],
    {
      env: {
        ...process.env,
        [EXPLORER_TARGET_VARIABLE]: path
      },
      timeout: FIND_TIMEOUT_MILLISECONDS,
      windowsHide: true
    }
  );
  const handle = Number.parseInt(stdout.trim(), 10);
  const isFound = Number.isInteger(handle) && handle > 0;
  return isFound && bringWindowToFront(BigInt(handle));
}

/**
 * Shows a file or folder in Explorer, selected in its parent. A window that
 * already shows that parent (or the folder itself) is brought to the front, with
 * the item selected, instead of a second window opening; otherwise Explorer
 * opens with `explorer.exe /select`, because the Launcher cannot select an item.
 *
 * @param path - The full path of the file or folder.
 */
export function revealInExplorer(path: string) {
  focusOpenExplorerWindow(path)
    .then(isFocused => {
      if (!isFocused) {
        startExplorerSelecting(path);
      }
    })
    .catch(() => startExplorerSelecting(path));
}
