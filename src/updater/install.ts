import { createWindowsRegistry } from "#src/app/activation/native.js";
import type { RegistryBackend } from "#src/app/activation/registry.js";
import type { ShellBackend } from "#src/app/shell/backend.js";
import { createShortcut } from "#src/app/shell/shortcut.js";
import { hasPackage } from "#src/store/identity.js";
import { spawn } from "node:child_process";
import path from "node:path";

const UNINSTALL_KEY = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall";
const START_MENU_PROGRAMS = "Microsoft\\Windows\\Start Menu\\Programs";
const SHORTCUT_EXTENSION = ".lnk";
const DELETE_DELAY_SECONDS = 3;

/** What `install` and `uninstall` share. */
export interface InstallIdentity {
  /** The key below Uninstall in the registry: letters, digits, `.`, `_` and `-`. */
  readonly id: string;

  /** The name Add or remove programs and the Start menu show. */
  readonly displayName: string;

  /** Stands in for the registry; the tests give one. */
  readonly registry?: RegistryBackend;

  /** Stands in for the Start menu folder; `%APPDATA%\Microsoft\Windows\Start Menu\Programs` by default. */
  readonly startMenuDirectory?: string;

  /** Stands in for Windows when writing the shortcut; the tests give one. */
  readonly shellBackend?: ShellBackend;
}

/** What `install` takes. */
export interface InstallOptions extends InstallIdentity {
  /** The install root, as given to `Updater`. */
  readonly root: string;

  /** The version now installed, shown in Add or remove programs. */
  readonly version: string;

  /** The publisher shown in Add or remove programs. */
  readonly publisher: string;

  /** The stable program in the install root that starts the newest version and runs `uninstallArguments`. */
  readonly launcher: string;

  /** What the launcher is given to remove the app: it should end by calling `uninstall`; `--uninstall` by default. */
  readonly uninstallArguments?: readonly string[];

  /** The file the icon comes from (an `.ico` or `.exe`); the launcher's own by default. */
  readonly iconPath?: string;
}

function programsFolder(options: InstallIdentity) {
  const appData = process.env["APPDATA"] ?? "";
  return options.startMenuDirectory ?? path.join(appData, START_MENU_PROGRAMS);
}

function shortcutPath(options: InstallIdentity) {
  return path.join(programsFolder(options), `${options.displayName}${SHORTCUT_EXTENSION}`);
}

function uninstallKey(id: string) {
  return `${UNINSTALL_KEY}\\${id}`;
}

/**
 * Makes the app an installed program: an entry in Add or remove programs
 * (current user only, no administrator rights) whose Uninstall runs the
 * launcher, and a Start menu shortcut. Safe to call again after an update, it
 * overwrites both and refreshes the version shown. In a package (MSIX) it
 * does nothing: Windows already lists the app and removes it.
 *
 * @param options - The identity, the install root, the version and the launcher.
 */
export function install(options: InstallOptions) {
  const isPackaged = hasPackage();
  if (isPackaged) {
    return;
  }

  const { id, displayName, version, publisher, root, launcher, registry = createWindowsRegistry() } = options;
  const key = uninstallKey(id);
  const uninstallCommand = [launcher, ...options.uninstallArguments ?? ["--uninstall"]]
    .map(argument => `"${argument}"`)
    .join(" ");
  const values = [
    ["DisplayName", displayName],
    ["DisplayVersion", version],
    ["Publisher", publisher],
    ["InstallLocation", root],
    ["DisplayIcon", options.iconPath ?? launcher],
    ["UninstallString", uninstallCommand],
    ["QuietUninstallString", uninstallCommand]
  ] as const;
  for (const [name, value] of values) {
    registry.setString({
      key,
      name,
      value
    });
  }

  createShortcut({
    path: shortcutPath(options),
    target: launcher,
    workingDirectory: root,
    description: displayName,
    shouldOverwrite: true,
    ...options.shellBackend && {
      backend: options.shellBackend
    }
  });
}

/** What `uninstall` takes. */
export interface UninstallOptions extends InstallIdentity {
  /** The install root to delete, as given to `install`. */
  readonly root: string;
}

/**
 * Takes the app out of Add or remove programs and the Start menu, then
 * deletes the install root from a detached command a few seconds later, so
 * the running launcher and version are free by then. Do the app's own
 * cleanup (startup entry, protocol handlers, native messaging) before this.
 *
 * @param options - The identity and the install root.
 */
export function uninstall(options: UninstallOptions) {
  const isPackaged = hasPackage();
  if (isPackaged) {
    return;
  }

  const { id, root, registry = createWindowsRegistry() } = options;
  registry.deleteTree(uninstallKey(id));
  const shortcut = shortcutPath(options);
  const deletion = `ping -n ${DELETE_DELAY_SECONDS} 127.0.0.1 >nul & del /f /q "${shortcut}" & rmdir /s /q "${root}"`;
  const child = spawn("cmd.exe", ["/d", "/s", "/c", deletion], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    windowsVerbatimArguments: true
  });
  child.unref();
}
