import { PermissionName } from "#src/web-apis/permissions.js";

/** Chrome permission names that a native app can honor, with the Web permissions that back each. */
export const NATIVE_PERMISSIONS: ReadonlyMap<string, readonly PermissionName[]> = new Map([
  ["audioCapture", [PermissionName.MICROPHONE]],
  ["bluetooth", [PermissionName.BLUETOOTH]],
  ["clipboardRead", [PermissionName.CLIPBOARD_READ]],
  ["clipboardWrite", [PermissionName.CLIPBOARD_WRITE]],
  ["gcm", [PermissionName.PUSH]],
  ["geolocation", [PermissionName.GEOLOCATION]],
  ["idle", [PermissionName.IDLE_DETECTION]],
  ["notifications", [PermissionName.NOTIFICATIONS]],
  ["power", [PermissionName.SCREEN_WAKE_LOCK]],
  ["unlimitedStorage", [PermissionName.PERSISTENT_STORAGE]],
  ["videoCapture", [PermissionName.CAMERA]]
]);

/**
 * Chrome permission names with no meaning in a native app: there is nothing
 * to ask the user, so they are always held and cannot be removed.
 */
export const GRANTED_BY_DEFAULT: ReadonlySet<string> = new Set([
  "activeTab",
  "alarms",
  "background",
  "contextMenus",
  "cookies",
  "declarativeNetRequest",
  "downloads",
  "offscreen",
  "scripting",
  "storage",
  "tabs",
  "webRequest",
  "windows"
]);

/** The origin of a native app: every match pattern is held, none can be removed. */
export const ALL_URLS = "<all_urls>";

const SETTINGS_PREFIX = "ms-settings:";

/** Where Windows keeps the switch for a Web permission, to send the user to when asking is not enough. */
export const SETTINGS_PAGE: ReadonlyMap<PermissionName, string> = new Map([
  [PermissionName.ACCELEROMETER, `${SETTINGS_PREFIX}privacy-motion`],
  [PermissionName.BLUETOOTH, `${SETTINGS_PREFIX}bluetooth`],
  [PermissionName.CAMERA, `${SETTINGS_PREFIX}privacy-webcam`],
  [PermissionName.GEOLOCATION, `${SETTINGS_PREFIX}privacy-location`],
  [PermissionName.MICROPHONE, `${SETTINGS_PREFIX}privacy-microphone`],
  [PermissionName.NOTIFICATIONS, `${SETTINGS_PREFIX}notifications`]
]);

/** The page of the Settings app for permissions that have no page of their own. */
export const FALLBACK_SETTINGS_PAGE = `${SETTINGS_PREFIX}privacy`;
