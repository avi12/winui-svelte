/** The four template types of `chrome.notifications`. */
export const NotificationTemplateType = {
  BASIC: "basic",
  IMAGE: "image",
  LIST: "list",
  PROGRESS: "progress"
} as const;
/** One of the values of `NotificationTemplateType`. */
export type NotificationTemplateType = (typeof NotificationTemplateType)[keyof typeof NotificationTemplateType];

/** The two permission levels of `chrome.notifications.getPermissionLevel`. */
export const NotificationPermissionLevel = {
  GRANTED: "granted",
  DENIED: "denied"
} as const;
/** One of the values of `NotificationPermissionLevel`. */
export type NotificationPermissionLevel =
  (typeof NotificationPermissionLevel)[keyof typeof NotificationPermissionLevel];

/** A button of a notification; Chrome shows at most two. */
export interface ChromeNotificationButton {
  readonly title: string;
  readonly iconUrl?: string | undefined;
}

/** One line of a `list` notification. */
export interface ChromeNotificationItem {
  readonly title: string;
  readonly message: string;
}

/** The options of `create` and `update`, with Chrome's names. */
export interface ChromeNotificationOptions {
  readonly type?: NotificationTemplateType | undefined;
  readonly title?: string | undefined;
  readonly message?: string | undefined;

  /** A picture, a path or an address; Chrome requires it, a native app may go without. */
  readonly iconUrl?: string | undefined;
  readonly contextMessage?: string | undefined;

  /** From -2 to 2; below 0 is silent, 2 asks the user to act on it. */
  readonly priority?: number | undefined;

  /** Milliseconds since 1970. */
  readonly eventTime?: number | undefined;
  readonly buttons?: readonly ChromeNotificationButton[] | undefined;

  /** The picture of an `image` notification. */
  readonly imageUrl?: string | undefined;
  readonly items?: readonly ChromeNotificationItem[] | undefined;

  /** From 0 to 100, for a `progress` notification. */
  readonly progress?: number | undefined;

  /** False to make a click do nothing; true by default. */
  readonly isClickable?: boolean | undefined;
  readonly requireInteraction?: boolean | undefined;
  readonly silent?: boolean | undefined;
}
