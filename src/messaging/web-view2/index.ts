// The host side of a Svelte app's link to web content in a WebView2 control.
// Opt-in: nothing here loads until it is imported.

export type {
  ControllerOptionsLike,
  CoreWebView2Like,
  EnvironmentLike,
  ProcessFailedArguments,
  WebView2Like
} from "./core.ts";
export { addDocumentCreatedScript, executeScript, openDevTools, waitForCoreWebView2 } from "./core.ts";
export type { WebView2EnvironmentInit } from "./environment.ts";
export { createWebView2Environment, startWebView2 } from "./environment.ts";
export type { Cookie, CookieInit } from "./cookies.ts";
export { CookieSameSite, deleteCookie, getCookies, setCookie } from "./cookies.ts";
export type { PermissionRequest } from "./policy.ts";
export { onDownloadStarting, onNavigationStarting, onPermissionRequested, PermissionKind, PermissionState } from "./policy.ts";
export type { WebView2Transport } from "./transport.ts";
export { webView2Transport } from "./transport.ts";
export type { RequestFilter, WebRequest, WebResponse } from "./requests.ts";
export { blockRequests, onWebResourceRequested, ResourceContext, StatusCode } from "./requests.ts";
export { callDevToolsMethod, onDevToolsEvent } from "./protocol.ts";
export { dispatchKey, dispatchMouseClick, keyEventParameters, KeyEventType, MouseButton, TypeMode, typeText } from "./input.ts";
export type { WebView2Guard } from "./recovery.ts";
export { keepWebView2Alive, ProcessFailureKind } from "./recovery.ts";
