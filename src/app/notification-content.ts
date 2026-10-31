/** How urgent a notification is; Windows gives each a different look and behaviour. */
export const NotificationScenario = {
  REMINDER: "reminder",
  ALARM: "alarm",
  INCOMING_CALL: "incomingCall",
  URGENT: "urgent"
} as const;
/** One of the values of `NotificationScenario`. */
export type NotificationScenario = (typeof NotificationScenario)[keyof typeof NotificationScenario];

type NumberedSuffix = "" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";

/**
 * The system sounds a notification can play: `default`, `im`, `mail`,
 * `reminder`, `sms`, `alarm` to `alarm10` and `call` to `call10`.
 */
export type NotificationSound =
  | "default"
  | "im"
  | "mail"
  | "reminder"
  | "sms"
  | `alarm${NumberedSuffix}`
  | `call${NumberedSuffix}`;

/** The look of a button. */
export const NotificationButtonStyle = {
  DEFAULT: "default",
  SUCCESS: "success",
  CRITICAL: "critical"
} as const;
/** One of the values of `NotificationButtonStyle`. */
export type NotificationButtonStyle = (typeof NotificationButtonStyle)[keyof typeof NotificationButtonStyle];

/** The state of a progress bar; every field is optional and a missing one is left empty. */
export interface NotificationProgress {
  /** The bar's title. */
  readonly title?: string;

  /** A line under the bar. */
  readonly status?: string;

  /** Between 0 and 1. */
  readonly value?: number;

  /** Text shown instead of the percentage. */
  readonly valueStringOverride?: string;
}

/** One entry of a selection input. */
export interface NotificationChoice {
  readonly id: string;
  readonly content: string;
}

/** A control the notification carries: a button, a text box or a selection. */
export type NotificationControl =
  | {
    readonly kind: "button";
    readonly title: string;
    readonly arguments: ReadonlyMap<string, string>;
    readonly style?: NotificationButtonStyle;
    readonly tooltip?: string;
    readonly iconUri?: string;
    readonly inputId?: string;
  }
  | {
    readonly kind: "text-input";
    readonly id: string;
    readonly placeholder?: string;
    readonly title?: string;
  }
  | {
    readonly kind: "selection";
    readonly id: string;
    readonly title?: string;
    readonly items: readonly NotificationChoice[];
    readonly selectedItem?: string;
  };

/** What a notification shows, as `NotificationSource.show` takes it. */
export interface NotificationContent {
  /** The first line, in bold. */
  readonly title: string;

  /** The text under it. */
  readonly body?: string;

  /** With `group`, names the notification so a later one can replace or remove it. */
  readonly tag?: string;

  /** See `tag`. */
  readonly group?: string;

  /** The app logo beside the text, as a `file:` or `https:` address. */
  readonly iconUri?: string;

  /** A picture inside the notification. */
  readonly imageUri?: string;

  /** A wide picture across the top. */
  readonly heroUri?: string;

  /** Small text naming the source, at the bottom. */
  readonly attribution?: string;

  /** Milliseconds since 1970 the notification is shown as made at. */
  readonly timestamp?: number;

  /** Milliseconds since 1970 after which Windows removes it from the notification center. */
  readonly expiration?: number;

  readonly scenario?: NotificationScenario;

  /** No sound at all; wins over `sound`. */
  readonly isSilent?: boolean;

  readonly sound?: NotificationSound;

  readonly progress?: NotificationProgress;

  readonly controls?: readonly NotificationControl[];
}
