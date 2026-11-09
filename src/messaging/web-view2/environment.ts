import { messageOf } from "./core.ts";
import type { CoreWebView2Like, EnvironmentLike, WebView2Like } from "./core.ts";
import { CoreWebView2Environment } from "#winui/microsoft/web/web-view2/core/CoreWebView2Environment";
import { CoreWebView2EnvironmentOptions } from "#winui/microsoft/web/web-view2/core/CoreWebView2EnvironmentOptions";

const ARGUMENT_SEPARATOR = " ";
const INVALID_STATE_CODE = /0x?8007139f/i;
const BUSY_CODE = /0x?800700aa/i;
const started = new WeakMap<object, Promise<CoreWebView2Like>>();

/** How an environment is built; every member is optional. */
export interface WebView2EnvironmentInit {
  /** A fixed-version runtime's folder; the installed runtime when empty or absent. */
  browserExecutableFolder?: string;

  /** The profile folder of this environment; one browser process runs per folder. */
  userDataFolder?: string;

  /** Chromium switches, joined with spaces, such as `--autoplay-policy=no-user-gesture-required`. */
  additionalBrowserArguments?: string[];

  /** The browser's language, such as `en-US`. */
  language?: string;
}

// WebView2 answers two different causes with 0x8007139F; the message names both
function explainFailure({ error, userDataFolder }: {
  error: unknown;
  userDataFolder: string;
}) {
  const text = messageOf(error);
  if (INVALID_STATE_CODE.test(text)) {
    return new Error(
      `WebView2 refused to start (0x8007139F): either this process cannot launch a browser (run it in an ordinary desktop session), or ${userDataFolder} is already in use with different environment options`,
      { cause: error }
    );
  }

  if (BUSY_CODE.test(text)) {
    return new Error(`WebView2 profile folder ${userDataFolder} is open in another browser (0x800700AA); use one folder per running app`, { cause: error });
  }

  return error;
}

/**
 * Builds a WebView2 environment: a profile folder of its own and the Chromium
 * switches of its browser; pass it to `startWebView2`
 * `WEBVIEW2_USER_DATA_FOLDER` overrides `userDataFolder` when it is set, so
 * start the app with `initWindowsAppSdk({ webViewUserDataFolder: false })`
 *
 * @param init - The folder, the switches and the language.
 * @returns The environment.
 */
export async function createWebView2Environment(init: WebView2EnvironmentInit = {}) {
  const { browserExecutableFolder = "", userDataFolder = "", additionalBrowserArguments = [], language = "" } = init;
  const options = CoreWebView2EnvironmentOptions.create();
  options.additionalBrowserArguments = additionalBrowserArguments.join(ARGUMENT_SEPARATOR);
  const isLanguageSet = language !== "";
  if (isLanguageSet) {
    options.language = language;
  }

  try {
    return await CoreWebView2Environment.createWithOptionsAsync(browserExecutableFolder, userDataFolder, options);
  } catch (error) {
    throw explainFailure({
      error,
      userDataFolder
    });
  }
}

async function start({ control, environment, profileName, isInPrivateMode }: {
  control: WebView2Like;
  environment: EnvironmentLike;
  profileName: string | undefined;
  isInPrivateMode: boolean;
}) {
  const controllerOptions = environment.createCoreWebView2ControllerOptions();
  const hasProfileName = profileName !== undefined;
  if (hasProfileName) {
    controllerOptions.profileName = profileName;
  }

  controllerOptions.isInPrivateModeEnabled = isInPrivateMode;
  try {
    await control.ensureCoreWebView2Async(environment, controllerOptions);
  } catch (error) {
    throw explainFailure({
      error,
      userDataFolder: environment.userDataFolder
    });
  }

  return control.coreWebView2;
}

/**
 * Starts the control's browser in `environment`, with the profile
 * `profileName` of its folder, and resolves with the `CoreWebView2`
 * The first start of a control wins: call this before anything that starts it
 * with the default environment (`waitForCoreWebView2` and every helper that
 * calls it); a second call resolves with the same core and starts nothing
 * The control must be in a window for the browser to start
 *
 * @param options - The control, its environment, the profile and the private mode.
 * @returns The control's `CoreWebView2`.
 */
export function startWebView2({ control, environment, profileName, isInPrivateMode = false }: {
  control: WebView2Like;
  environment: EnvironmentLike;
  profileName?: string;
  isInPrivateMode?: boolean;
}) {
  const existing = started.get(control);
  const isStarted = existing !== undefined;
  if (isStarted) {
    return existing;
  }

  const pending = start({
    control,
    environment,
    profileName,
    isInPrivateMode
  });
  started.set(control, pending);
  pending.catch(() => started.delete(control));
  return pending;
}
