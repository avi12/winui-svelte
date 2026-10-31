import { initWinappsdk } from "@microsoft/dynwinrt";
import { BOOTSTRAPPER_NAME, bootstrapperFolders } from "#src/runtime-files.js";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// The Windows App SDK (WinUI 3) comes first, before any WinRT object: its
// bootstrapper finds the runtime packages installed for the user. The folder the
// bootstrapper is in goes on PATH too: it holds the native libraries a WebView2 or
// Win2D canvas loads by name (WebView2Loader.dll, Microsoft.Graphics.Canvas.dll), which
// would not be found beside node.exe.

const BOOTSTRAP_VARIABLE = "WINAPPSDK_BOOTSTRAP_DLL_PATH";
const USER_DATA_VARIABLE = "WEBVIEW2_USER_DATA_FOLDER";
const DEFAULT_APP_NAME = "app";
// The runtime the package is built against.
const WINDOWS_APP_SDK_MAJOR = 2;
const WINDOWS_APP_SDK_MINOR = 2;

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

  /**
   * Where a WebView2 keeps its profile (cookies, cache). WebView2 defaults to
   * a folder beside the executable, which for an app that runs under node.exe
   * is Program Files, not writable, and the browser then never starts. This
   * option wins, then the `WEBVIEW2_USER_DATA_FOLDER` variable, then
   * `%LOCALAPPDATA%\winui-svelte\<the app's main script>\WebView2`, one folder
   * per app, since two apps with different WebView2 settings cannot share one.
   */
  webViewUserDataFolder?: string;
}

/**
 * The runtime is not installed (or not this version). The app installs the
 * one it carries and starts again.
 */
export class WindowsAppRuntimeMissing extends Error {}

function assertSupportedPlatform() {
  const isSupported = process.platform === "win32" && (process.arch === "x64" || process.arch === "arm64");
  if (!isSupported) {
    throw new Error(`winui-svelte runs on Windows (x64 or arm64) only, not ${process.platform} ${process.arch}`);
  }
}

function defaultUserDataFolder() {
  const appName = path.parse(process.argv[1] ?? "").name || DEFAULT_APP_NAME;
  return path.join(process.env["LOCALAPPDATA"] ?? tmpdir(), "winui-svelte", appName, "WebView2");
}

// The folder first on PATH, once: the native libraries a WebView2 loads by
// name are found there, and ours must win over any other copy.
function putOnPath(folder: string) {
  const existing = (process.env["PATH"] ?? "").split(path.delimiter).filter(entry => entry !== "");
  const isPresent = existing.includes(folder);
  if (!isPresent) {
    process.env["PATH"] = [folder, ...existing].join(path.delimiter);
  }
}

function bootstrapPath(folders: string[]) {
  return folders.map(folder => path.join(folder, BOOTSTRAPPER_NAME)).find(candidate => existsSync(candidate));
}

/**
 * Starts the Windows App SDK on this thread, before any WinRT object exists.
 * Imports nothing of WinRT, so it is safe on a host's main thread. Call it on
 * the main thread: the environment it sets (the bootstrapper, PATH, the
 * WebView2 profile folder) reaches the process only from there, and a worker
 * started afterwards inherits it.
 *
 * @throws {Error} on a platform other than Windows x64 or arm64
 * @throws {WindowsAppRuntimeMissing} when the runtime is not installed
 */
export function initWindowsAppSdk(options: WindowsAppSdkOptions = {}) {
  assertSupportedPlatform();
  const {
    major = WINDOWS_APP_SDK_MAJOR,
    minor = WINDOWS_APP_SDK_MINOR,
    folders = [],
    webViewUserDataFolder
  } = options;
  process.env[USER_DATA_VARIABLE] = webViewUserDataFolder ?? process.env[USER_DATA_VARIABLE] ?? defaultUserDataFolder();
  const found = bootstrapPath([...folders, ...bootstrapperFolders()]);
  const isFound = found !== undefined;
  if (isFound) {
    process.env[BOOTSTRAP_VARIABLE] ??= found;
    putOnPath(path.dirname(found));
  }

  const isNamed = process.env[BOOTSTRAP_VARIABLE] !== undefined;
  const isMissing = !isFound && !isNamed;
  if (isMissing) {
    const tried = [...folders, ...bootstrapperFolders()].join(", ");
    throw new WindowsAppRuntimeMissing(`${BOOTSTRAPPER_NAME} not found in ${tried}: buildApp writes it into the output folder, or name its folder in the folders option`);
  }

  try {
    initWinappsdk(major, minor);
  } catch (error) {
    throw new WindowsAppRuntimeMissing(String(error), { cause: error });
  }
}
