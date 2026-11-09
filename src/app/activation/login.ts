import { contextOf } from "./context.ts";
import type { RegistrationOptions } from "./context.ts";
import { createWindowsRegistry } from "./native.ts";
import {
  addFileTypes,
  disableLaunchAtLogin,
  enableLaunchAtLogin,
  readLaunchAtLogin,
  removeFileTypes
} from "./registration.ts";

/**
 * Lists the app among the programs that open files with these extensions
 * (`HKEY_CURRENT_USER\Software\Classes`), so a double-click or "Open with"
 * starts it and the file reaches it as a `file` activation. It does not make
 * the app the default: Windows keeps that choice for the user. An extension
 * that runs code (`.exe`, `.bat`, `.js` and so on) is a `SecurityError`.
 *
 * @param options - The app's identifier (letters, digits, `.`, `_`, `-`),
 *   the extensions with their dots, a description, and the registry and
 *   command for a test or a bundled app.
 */
export function registerFileTypes(options: RegistrationOptions & {
  id: string;
  extensions: readonly string[];
  description?: string;
}) {
  addFileTypes({
    ...options,
    ...contextOf(options)
  });
}

/**
 * Takes away what `registerFileTypes` wrote for these extensions, and only
 * that; a type another program owns is left alone.
 *
 * @param options - The same identifier and extensions.
 * @returns The extensions whose registration was removed.
 */
export function unregisterFileTypes(options: Pick<RegistrationOptions, "registry"> & {
  id: string;
  extensions: readonly string[];
}) {
  return removeFileTypes({
    ...options,
    registry: options.registry ?? createWindowsRegistry()
  });
}

/**
 * Starts the app when the user signs in (or stops doing so) through the
 * per-user Run key; Windows lists it under Settings, Apps, Startup. The start
 * reaches the app as a `startup` activation.
 *
 * @param options - A name for the entry (letters, digits, `.`, `_`, `-` and spaces
 *   inside, such as `Cyber Journeys`),
 *   whether it should exist, extra arguments, and the registry and command
 *   for a test or a bundled app.
 */
export function launchAtLogin(options: RegistrationOptions & {
  id: string;
  isEnabled: boolean;
  arguments?: readonly string[];
}) {
  if (!options.isEnabled) {
    disableLaunchAtLogin({
      id: options.id,
      registry: options.registry ?? createWindowsRegistry()
    });
    return;
  }

  enableLaunchAtLogin({
    ...options,
    ...contextOf(options)
  });
}

/**
 * Reads the startup entry `launchAtLogin` wrote.
 *
 * @param options - The entry's name and, for a test, the registry.
 * @returns Whether it exists and the command line it runs.
 */
export function getLaunchAtLogin(options: Pick<RegistrationOptions, "registry"> & { id: string }) {
  return readLaunchAtLogin({
    ...options,
    registry: options.registry ?? createWindowsRegistry()
  });
}
