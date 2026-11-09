import { jsonSchema } from "#src/messaging/json.js";

// The part of WinUI's WebView2 and CoreWebView2 these helpers use, as shapes:
// the generated classes satisfy them, and a test hands in a fake.

/** What `WebMessageReceived` hands over. */
export interface WebMessageArguments {
  /** The URI of the page that posted the message. */
  readonly source: string;
  readonly webMessageAsJson: string;
}

/** What `NavigationStarting` hands over. */
export interface NavigationArguments {
  readonly uri: string;
  readonly isUserInitiated: boolean;
  cancel: boolean;
}

/** What `DownloadStarting` hands over. */
export interface DownloadArguments {
  readonly downloadOperation: { readonly uri: string };
  cancel: boolean;
  handled: boolean;
  resultFilePath: string;
}

/** What `PermissionRequested` hands over. */
export interface PermissionArguments {
  readonly uri: string;
  readonly permissionKind: number;
  readonly isUserInitiated: boolean;
  state: number;
  handled: boolean;
  savesInProfile: boolean;
}

/** What `WebResourceRequested` hands over of the request. */
export interface WebResourceRequestLike {
  readonly uri: string;
  readonly method: string;
}

/** What `WebResourceRequested` hands over; assigning `response` answers the request. */
export interface WebResourceRequestedArguments {
  readonly request: WebResourceRequestLike;
  readonly resourceContext: number;
  response: unknown;
  getDeferral(): { complete(): void };
}

/** What `DevToolsProtocolEventReceived` hands over. */
export interface DevToolsEventArguments {
  readonly parameterObjectAsJson: string;
}

/** The subscription point of one DevTools protocol event. */
export interface DevToolsEventReceiverLike {
  onDevToolsProtocolEventReceived(callback: (sender: unknown, args: DevToolsEventArguments) => void): () => void;
}

/** The controller options of one control: its profile inside the environment's folder. */
export interface ControllerOptionsLike {
  profileName: string;
  isInPrivateModeEnabled: boolean;
}

/**
 * The environment of a browser: its profile folder, and its part in answering a
 * request (`content` is a WinRT stream).
 */
export interface EnvironmentLike {
  readonly userDataFolder: string;
  createCoreWebView2ControllerOptions(): ControllerOptionsLike;
  createWebResourceResponse(content: unknown, statusCode: number, reasonPhrase: string, headers: string): unknown;
}

/** One cookie of the browser profile. */
export interface CookieLike {
  readonly name: string;
  readonly domain: string;
  readonly path: string;
  readonly isSession: boolean;
  value: string;
  expires: number;
  isHttpOnly: boolean;
  isSecure: boolean;
  sameSite: number;
}

/** The profile's cookie store. */
export interface CookieManagerLike {
  getCookiesAsync(uri: string): Promise<{ toArray(): CookieLike[] } | null>;
  createCookie(name: string, value: string, domain: string, path: string): CookieLike;
  addOrUpdateCookie(cookie: CookieLike): void;
  deleteCookiesWithDomainAndPath(name: string, domain: string, path: string): void;
  deleteAllCookies(): void;
}

/** What `CoreProcessFailed` hands over. */
export interface ProcessFailedArguments {
  /** A `CoreWebView2ProcessFailedKind`; 0 is the browser process. */
  readonly processFailedKind: number;
}

/** What the helpers use of `CoreWebView2`; every `on...` returns its unsubscribe. */
export interface CoreWebView2Like {
  readonly cookieManager: CookieManagerLike;
  readonly environment: EnvironmentLike;
  readonly browserProcessId: number;
  readonly settings: {
    areHostObjectsAllowed: boolean;
  };
  postWebMessageAsJson(webMessageAsJson: string): void;
  executeScriptAsync(javaScript: string): Promise<string>;
  addScriptToExecuteOnDocumentCreatedAsync(javaScript: string): Promise<string>;
  removeScriptToExecuteOnDocumentCreated(id: string): void;
  openDevToolsWindow(): void;
  reload(): void;
  addWebResourceRequestedFilter(uri: string, resourceContext: number): void;
  removeWebResourceRequestedFilter(uri: string, resourceContext: number): void;
  callDevToolsProtocolMethodAsync(methodName: string, parametersAsJson: string): Promise<string>;
  getDevToolsProtocolEventReceiver(eventName: string): DevToolsEventReceiverLike;
  onWebResourceRequested(callback: (sender: unknown, args: WebResourceRequestedArguments) => void): () => void;
  onWebMessageReceived(callback: (sender: unknown, args: WebMessageArguments) => void): () => void;
  onNavigationStarting(callback: (sender: unknown, args: NavigationArguments) => void): () => void;
  onDownloadStarting(callback: (sender: unknown, args: DownloadArguments) => void): () => void;
  onPermissionRequested(callback: (sender: unknown, args: PermissionArguments) => void): () => void;
}

/** The text of whatever a call threw. */
export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** What the helpers use of the `WebView2` control. */
export interface WebView2Like {
  readonly coreWebView2: CoreWebView2Like;
  onCoreProcessFailed(callback: (sender: unknown, args: ProcessFailedArguments) => void): () => void;
  ensureCoreWebView2Async(): Promise<void>;
  ensureCoreWebView2Async(environment: EnvironmentLike): Promise<void>;
  ensureCoreWebView2Async(environment: EnvironmentLike, controllerOptions: ControllerOptionsLike): Promise<void>;
}

/**
 * Starts the control's browser if it is not started and resolves with its
 * `CoreWebView2` once it is ready (`CoreWebView2Initialized` has been
 * raised); resolves at once when it already is
 * The control must be in a window for the browser to start
 * It starts the default environment (the process's one profile folder, no
 * flags); to use a custom environment, call `startWebView2` first
 */
export async function waitForCoreWebView2(control: WebView2Like) {
  await control.ensureCoreWebView2Async();
  return control.coreWebView2;
}

/**
 * Runs `code` in the page and resolves with its value as JSON (`null` for
 * `undefined`); rejects when the page's script threw or returned a value that
 * is not JSON
 * The result is the page's, so it is checked, not trusted
 */
export async function executeScript({ control, code }: {
  control: WebView2Like;
  code: string;
}) {
  const core = await waitForCoreWebView2(control);
  const text = await core.executeScriptAsync(code);
  return jsonSchema.parse(JSON.parse(text));
}

/**
 * Runs `code` before every page script in every document the control loads,
 * from now on; resolves with the function that removes it
 */
export async function addDocumentCreatedScript({ control, code }: {
  control: WebView2Like;
  code: string;
}) {
  const core = await waitForCoreWebView2(control);
  const identifier = await core.addScriptToExecuteOnDocumentCreatedAsync(code);
  return () => core.removeScriptToExecuteOnDocumentCreated(identifier);
}

/** Opens the browser's developer tools window for the page. */
export async function openDevTools(control: WebView2Like) {
  const core = await waitForCoreWebView2(control);
  core.openDevToolsWindow();
}
