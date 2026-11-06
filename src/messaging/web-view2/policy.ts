import { waitForCoreWebView2 } from "./core.ts";
import type { WebView2Like } from "./core.ts";
import { CoreWebView2PermissionKind } from "#winui/microsoft/web/web-view2/core/CoreWebView2PermissionKind";
import { CoreWebView2PermissionState } from "#winui/microsoft/web/web-view2/core/CoreWebView2PermissionState";

/** What the host answers a page that asks for a permission. */
export const PermissionState = {
  DEFAULT: "default",
  ALLOW: "allow",
  DENY: "deny"
} as const;
/** One of the values of `PermissionState`. */
export type PermissionState = (typeof PermissionState)[keyof typeof PermissionState];

/** What a page can ask permission for. */
export const PermissionKind = {
  UNKNOWN: "unknown",
  MICROPHONE: "microphone",
  CAMERA: "camera",
  GEOLOCATION: "geolocation",
  NOTIFICATIONS: "notifications",
  OTHER_SENSORS: "otherSensors",
  CLIPBOARD_READ: "clipboardRead",
  MULTIPLE_AUTOMATIC_DOWNLOADS: "multipleAutomaticDownloads",
  FILE_READ_WRITE: "fileReadWrite",
  AUTOPLAY: "autoplay",
  LOCAL_FONTS: "localFonts",
  MIDI_SYSTEM_EXCLUSIVE_MESSAGES: "midiSystemExclusiveMessages",
  WINDOW_MANAGEMENT: "windowManagement"
} as const;
/** One of the values of `PermissionKind`. */
export type PermissionKind = (typeof PermissionKind)[keyof typeof PermissionKind];

const STATES = new Map<PermissionState, number>([
  [PermissionState.DEFAULT, CoreWebView2PermissionState.Default],
  [PermissionState.ALLOW, CoreWebView2PermissionState.Allow],
  [PermissionState.DENY, CoreWebView2PermissionState.Deny]
]);
const KINDS = new Map<number, PermissionKind>([
  [CoreWebView2PermissionKind.UnknownPermission, PermissionKind.UNKNOWN],
  [CoreWebView2PermissionKind.Microphone, PermissionKind.MICROPHONE],
  [CoreWebView2PermissionKind.Camera, PermissionKind.CAMERA],
  [CoreWebView2PermissionKind.Geolocation, PermissionKind.GEOLOCATION],
  [CoreWebView2PermissionKind.Notifications, PermissionKind.NOTIFICATIONS],
  [CoreWebView2PermissionKind.OtherSensors, PermissionKind.OTHER_SENSORS],
  [CoreWebView2PermissionKind.ClipboardRead, PermissionKind.CLIPBOARD_READ],
  [CoreWebView2PermissionKind.MultipleAutomaticDownloads, PermissionKind.MULTIPLE_AUTOMATIC_DOWNLOADS],
  [CoreWebView2PermissionKind.FileReadWrite, PermissionKind.FILE_READ_WRITE],
  [CoreWebView2PermissionKind.Autoplay, PermissionKind.AUTOPLAY],
  [CoreWebView2PermissionKind.LocalFonts, PermissionKind.LOCAL_FONTS],
  [CoreWebView2PermissionKind.MidiSystemExclusiveMessages, PermissionKind.MIDI_SYSTEM_EXCLUSIVE_MESSAGES],
  [CoreWebView2PermissionKind.WindowManagement, PermissionKind.WINDOW_MANAGEMENT]
]);

/** A permission a page asked for. */
export interface PermissionRequest {
  readonly uri: string;
  readonly kind: PermissionKind;
  readonly isUserInitiated: boolean;
}

/**
 * Answers every permission request of the page: `decide` returns the state,
 * and the browser does not ask the user. Resolves with the function that stops
 * answering.
 */
export async function onPermissionRequested({ control, decide }: {
  control: WebView2Like;
  decide(request: PermissionRequest): PermissionState;
}) {
  const core = await waitForCoreWebView2(control);
  return core.onPermissionRequested((_sender, args) => {
    const state = decide({
      uri: args.uri,
      kind: KINDS.get(args.permissionKind) ?? PermissionKind.UNKNOWN,
      isUserInitiated: args.isUserInitiated
    });
    args.state = STATES.get(state) ?? CoreWebView2PermissionState.Default;
    args.handled = true;
  });
}

/**
 * Sends every download to the path `pathFor` returns, with no dialog; a
 * `null` cancels it. Resolves with the function that stops handling them.
 */
export async function onDownloadStarting({ control, pathFor }: {
  control: WebView2Like;
  pathFor(download: { readonly uri: string }): string | null;
}) {
  const core = await waitForCoreWebView2(control);
  return core.onDownloadStarting((_sender, args) => {
    const path = pathFor({ uri: args.downloadOperation.uri });
    args.handled = true;

    const isRefused = path === null;
    if (isRefused) {
      args.cancel = true;
      return;
    }

    args.resultFilePath = path;
  });
}

/**
 * Cancels every navigation `isAllowed` refuses, to the frame's own page or
 * any link or redirect. Resolves with the function that stops filtering.
 */
export async function onNavigationStarting({ control, isAllowed }: {
  control: WebView2Like;
  isAllowed(navigation: {
    readonly uri: string;
    readonly isUserInitiated: boolean;
  }): boolean;
}) {
  const core = await waitForCoreWebView2(control);
  return core.onNavigationStarting((_sender, args) => {
    const isRefused = !isAllowed({
      uri: args.uri,
      isUserInitiated: args.isUserInitiated
    });
    if (isRefused) {
      args.cancel = true;
    }
  });
}
