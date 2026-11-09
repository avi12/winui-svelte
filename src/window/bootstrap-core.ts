import { BootstrapMode, RuntimeSource } from "./bootstrap-mode.ts";
import { DpiAwareness, requestDpiAwareness } from "./dpi-awareness.ts";
import { guardProcessExit } from "./host-exit.ts";
import { BOOTSTRAPPER_NAME } from "#src/runtime-files.js";
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
   * `false` leaves the variable alone: set, it overrides the folder of an
   * environment made with `createWebView2Environment`.
   */
  webViewUserDataFolder?: string | false;

  /**
   * The DPI awareness to ask for before anything else; `perMonitorV2` by
   * default, `undefined` to leave the process as it is. Windows allows it once
   * per process and only before the first window exists, so a library that
   * creates a window before this call keeps an unaware process; a manifest that
   * already set it makes the call a no-op. Throws `DpiAwarenessTooLow` when the
   * process is refused and has less.
   */
  dpiAwareness?: DpiAwareness | undefined;

  /**
   * How the runtime is started; `auto` by default: a process whose package
   * graph holds the Windows App SDK (an MSIX whose manifest declares the
   * `PackageDependency`) activates WinUI with no bootstrapper, which refuses to
   * run there, so it is skipped; any other process calls it. The environment
   * and PATH steps run in every mode.
   */
  bootstrap?: BootstrapMode;
}

/** What starting the runtime touched, so a test can stand in for the process. */
export interface RuntimeProcess {
  bootstrapperFolders(): string[];
  hasWindowsAppRuntimeDependency(): boolean;
  initWinappsdk(major: number, minor: number): void;
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
 * The work of `initWindowsAppSdk`, on a process it is handed: the real one in
 * `bootstrap.ts`, a stand-in in a test.
 *
 * @param options - What `initWindowsAppSdk` takes.
 * @param runtimeProcess - The calls that reach the process.
 * @returns Which way the runtime came.
 */
export function startWindowsAppSdk({ options, runtimeProcess }: {
  options: WindowsAppSdkOptions;
  runtimeProcess: RuntimeProcess;
}) {
  assertSupportedPlatform();
  const dpiAwareness = "dpiAwareness" in options ? options.dpiAwareness : DpiAwareness.perMonitorV2;
  const isDpiAwarenessWanted = dpiAwareness !== undefined;
  if (isDpiAwarenessWanted) {
    requestDpiAwareness(dpiAwareness);
  }

  const {
    major = WINDOWS_APP_SDK_MAJOR,
    minor = WINDOWS_APP_SDK_MINOR,
    folders = [],
    webViewUserDataFolder,
    bootstrap = BootstrapMode.auto
  } = options;
  const isUserDataFolderWanted = webViewUserDataFolder !== false;
  if (isUserDataFolderWanted) {
    const existing = process.env[USER_DATA_VARIABLE];
    process.env[USER_DATA_VARIABLE] = webViewUserDataFolder ?? existing ?? defaultUserDataFolder();
  }

  const isPackageRuntime = bootstrap === BootstrapMode.never
    || (bootstrap === BootstrapMode.auto && runtimeProcess.hasWindowsAppRuntimeDependency());
  const candidates = [...folders, ...runtimeProcess.bootstrapperFolders()];
  const found = bootstrapPath(candidates);
  const isFound = found !== undefined;
  if (isFound) {
    process.env[BOOTSTRAP_VARIABLE] ??= found;
    putOnPath(path.dirname(found));
  }

  const isNamed = process.env[BOOTSTRAP_VARIABLE] !== undefined;
  const isMissing = !isFound && !isNamed && !isPackageRuntime;
  if (isMissing) {
    throw new WindowsAppRuntimeMissing(`${BOOTSTRAPPER_NAME} not found in ${candidates.join(", ")}: buildApp writes it into the output folder, or name its folder in the folders option`);
  }

  if (!isPackageRuntime) {
    try {
      runtimeProcess.initWinappsdk(major, minor);
    } catch (error) {
      throw new WindowsAppRuntimeMissing(String(error), { cause: error });
    }
  }

  guardProcessExit();
  return { runtime: isPackageRuntime ? RuntimeSource.package : RuntimeSource.bootstrapper };
}
