/** The Chromium-based browsers that read a native messaging host from the registry. */
export const NativeMessagingBrowser = {
  chrome: "chrome",
  edge: "edge",
  brave: "brave",
  chromium: "chromium"
} as const;

/** One of `NativeMessagingBrowser`'s values. */
export type NativeMessagingBrowser = (typeof NativeMessagingBrowser)[keyof typeof NativeMessagingBrowser];

/** Where each browser looks, below `HKEY_CURRENT_USER`, for the hosts of the current user. */
export const BROWSER_KEYS = {
  [NativeMessagingBrowser.chrome]: "Software\\Google\\Chrome",
  [NativeMessagingBrowser.edge]: "Software\\Microsoft\\Edge",
  [NativeMessagingBrowser.brave]: "Software\\BraveSoftware\\Brave-Browser",
  [NativeMessagingBrowser.chromium]: "Software\\Chromium"
} as const satisfies Record<NativeMessagingBrowser, string>;

/** Every browser, the default of the registrations. */
export const ALL_BROWSERS = Object.values(NativeMessagingBrowser);
