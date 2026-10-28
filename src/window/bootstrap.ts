import { initWinappsdk } from "@microsoft/dynwinrt";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The Windows App SDK (WinUI 3) comes first, before any WinRT object: its
// bootstrapper finds the runtime packages installed for the user.

const BOOTSTRAP_VARIABLE = "WINAPPSDK_BOOTSTRAP_DLL_PATH";
const BOOTSTRAP_NAME = "Microsoft.WindowsAppRuntime.Bootstrap.dll";
// The runtime the package is built against.
const WINDOWS_APP_SDK_MAJOR = 2;
const WINDOWS_APP_SDK_MINOR = 2;
// Where the bootstrapper is: dist/bin/<arch> in the published package (copied
// there by the build), .winapp/bin/<arch> in this repository (`winapp restore`).
const bundledFolders = [
  new URL(`../bin/${process.arch}`, import.meta.url),
  new URL(`../../.winapp/bin/${process.arch}`, import.meta.url)
].map(folder => fileURLToPath(folder));

/** Which Windows App SDK runtime to start, and where its bootstrapper may be. */
export interface WindowsAppSdkOptions {
  /** The runtime's major version the app was built against; the package's own by default. */
  major?: number;

  /** The runtime's minor version the app was built against; the package's own by default. */
  minor?: number;

  /**
   * Where the bootstrapper may be, first match wins: beside a packaged app,
   * say. The package ships one, which is tried last.
   */
  folders?: string[];
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
export function initWindowsAppSdk(options: WindowsAppSdkOptions = {}) {
  const { major = WINDOWS_APP_SDK_MAJOR, minor = WINDOWS_APP_SDK_MINOR, folders = [] } = options;
  const found = bootstrapPath([...folders, ...bundledFolders]);
  const isFound = found !== undefined;
  if (isFound) {
    process.env[BOOTSTRAP_VARIABLE] ??= found;
  }

  try {
    initWinappsdk(major, minor);
  } catch (error) {
    throw new WindowsAppRuntimeMissing(String(error), { cause: error });
  }
}
