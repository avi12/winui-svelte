/** The `id` that stands for no window: `onFocusChanged` reports it when focus leaves every window of the app. */
export const WINDOW_ID_NONE = -1;

/** The `windowId` that stands for the current window. */
export const WINDOW_ID_CURRENT = -2;

/** The `state` of a window. */
export const WindowState = {
  normal: "normal",
  minimized: "minimized",
  maximized: "maximized",
  fullscreen: "fullscreen",
  lockedFullscreen: "locked-fullscreen"
} as const;

/** One of `WindowState`'s values. */
export type WindowState = (typeof WindowState)[keyof typeof WindowState];

/** The `type` of a window; every window of a native app is `normal`. */
export const WindowType = {
  normal: "normal",
  popup: "popup",
  panel: "panel",
  app: "app",
  devtools: "devtools"
} as const;

/** One of `WindowType`'s values. */
export type WindowType = (typeof WindowType)[keyof typeof WindowType];

/** A window as `chrome.windows` reports it, in device pixels. */
export interface ChromeWindow {
  readonly id: number;
  readonly focused: boolean;
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
  readonly state: WindowState;
  readonly alwaysOnTop: boolean;

  /** Always false: there is no private mode. */
  readonly incognito: boolean;

  /** Always `normal`. */
  readonly type: WindowType;
}

/**
 * What `getAll`, `get`, `getCurrent` and `getLastFocused` take; both members are accepted and ignored, as a
 * window has no tabs and is always `normal`.
 */
export interface GetWindowInfo {
  readonly populate?: boolean | undefined;
  readonly windowTypes?: readonly WindowType[] | undefined;
}

/** What `update` takes. */
export interface UpdateWindowInfo {
  readonly left?: number | undefined;
  readonly top?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;

  /** True brings the window forward and gives it focus; false is accepted and changes nothing. */
  readonly focused?: boolean | undefined;

  /** Flashes the taskbar button until the window is brought forward; false stops it. */
  readonly drawAttention?: boolean | undefined;
  readonly state?: WindowState | undefined;
}

/** What `create` takes; `url`, `tabId`, `incognito`, `type` and `setSelfAsOpener` go to `open` as they are. */
export interface CreateWindowData extends UpdateWindowInfo {
  readonly url?: string | readonly string[] | undefined;
  readonly tabId?: number | undefined;
  readonly incognito?: boolean | undefined;
  readonly type?: WindowType | undefined;
  readonly setSelfAsOpener?: boolean | undefined;
}
