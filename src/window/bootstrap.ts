import { initWinappsdk } from "@microsoft/dynwinrt";
import { existsSync } from "node:fs";
import path from "node:path";

// The Windows App SDK (WinUI 3) comes first, before any WinRT object: its
// bootstrapper finds the runtime packages installed for the user.

const BOOTSTRAP_VARIABLE = "WINAPPSDK_BOOTSTRAP_DLL_PATH";
const BOOTSTRAP_NAME = "Microsoft.WindowsAppRuntime.Bootstrap.dll";

/** Which Windows App SDK runtime to start, and where its bootstrapper may be. */
export interface WindowsAppSdkOptions {
  /** The runtime's major version the app was built against. */
  major: number;

  /** The runtime's minor version the app was built against. */
  minor: number;

  /**
   * Where the bootstrapper may be, first match wins: beside a packaged app, or
   * in the folder `winapp restore` puts it in.
   */
  folders: string[];
}

/**
 * The runtime is not installed (or not this version). The app installs the
 * one it carries and starts again.
 */
export class WindowsAppRuntimeMissing extends Error {}

function bootstrapPath(folders: string[]) {
  return folders.map(folder => path.join(folder, BOOTSTRAP_NAME)).find(candidate => existsSync(candidate));
}

/**
 * Starts the Windows App SDK on this thread, before any WinRT object exists.
 * Imports nothing of WinRT, so it is safe on a host's main thread.
 *
 * @throws {WindowsAppRuntimeMissing} when the runtime is not installed
 */
export function initWindowsAppSdk(options: WindowsAppSdkOptions) {
  const found = bootstrapPath(options.folders);
  const isFound = found !== undefined;
  if (isFound) {
    process.env[BOOTSTRAP_VARIABLE] ??= found;
  }

  try {
    initWinappsdk(options.major, options.minor);
  } catch (error) {
    throw new WindowsAppRuntimeMissing(String(error), { cause: error });
  }
}
