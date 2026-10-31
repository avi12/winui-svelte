import type { NotificationContent } from "./notification-content.ts";
import { windowsNotificationSource } from "./notification-source.ts";
import { joinAppUserModel } from "#src/window/native.js";
import { AppNotificationManager } from "#src/winui.js";

export { argumentsOf } from "./notification-source.ts";
export type {
  NotificationButtonStyle,
  NotificationChoice,
  NotificationContent,
  NotificationControl,
  NotificationProgress,
  NotificationScenario,
  NotificationSound
} from "./notification-content.ts";

/** A click on a notification (or one of its buttons), as the app hears it. */
export interface NotificationInvocation {
  /** The raw argument string the notification carried. */
  readonly argument: string;

  /** The `arguments` the notification was shown with, read back. */
  readonly arguments: ReadonlyMap<string, string>;

  /** What the user typed or chose in the input with this id, if there was one. */
  readInput(id: string): string | undefined;
}

/** What `notify` takes. */
export interface NotifyOptions extends NotificationContent {
  /** Key-value pairs that come back in `onInvoked` when the user clicks. */
  readonly arguments?: Readonly<Record<string, string>>;

  /**
   * Called when the user clicks a notification of this app while it runs.
   * Only the first `notify` call's handler is used. A click after the process
   * has gone starts nothing: unpackaged, the platform has no entry point to
   * start.
   */
  readonly onInvoked?: (invocation: NotificationInvocation) => void;

  /** The name Windows shows for the app, with `iconPath` (unpackaged apps need both). */
  readonly displayName?: string;

  /** An image file for the app's icon in notifications. */
  readonly iconPath?: string;

  /**
   * Names the process for notifications: the same call as the window's
   * `appUserModelId`, so give the same id to both.
   */
  readonly appUserModelId?: string;
}

/** The notification as `showNotification` hands it on. */
export interface NotificationSpec extends NotificationContent {
  readonly arguments: ReadonlyMap<string, string>;
}

/** The app's name and icon for the platform, which an unpackaged app must give. */
export interface NotificationIdentity {
  readonly displayName: string;
  readonly iconPath: string;
}

/** The part of the notification manager that `showNotification` uses; a test stands in for it. */
export interface NotificationSource {
  register(identity: NotificationIdentity | undefined): void;
  show(spec: NotificationSpec): number;
  onInvoked(callback: (invocation: NotificationInvocation) => void): () => void;
}

/** What the web `Notification` needs beyond showing: removing, updating a bar, and the user's setting. */
export interface NotificationBackend extends NotificationSource {
  /** Whether this process can show app notifications at all. */
  isSupported(): boolean;

  /** False when the user or a policy has turned this app's notifications off. */
  isEnabled(): boolean;

  remove(id: number): Promise<void>;

  /** Changes the progress bar of the notification with this tag and group; false when it is gone. */
  updateProgress(update: {
    tag: string;
    group: string;
    sequence: number;
    progress: NotificationContent["progress"];
  }): Promise<boolean>;
}

/**
 * Registers the process with the platform once, and starts listening for clicks.
 *
 * @param options - The source, the identity (both parts or neither), the click handler and the notifier's state.
 * @throws {Error} When only one of `displayName` and `iconPath` is given.
 */
export function registerNotifier({ source, identity, onInvoked, state }: {
  source: NotificationSource;
  identity: Partial<NotificationIdentity>;
  onInvoked: ((invocation: NotificationInvocation) => void) | undefined;
  state: { isRegistered: boolean };
}) {
  const { displayName, iconPath } = identity;
  const hasHalfIdentity = (displayName === undefined) !== (iconPath === undefined);
  if (hasHalfIdentity) {
    throw new Error("notify takes displayName and iconPath together or neither");
  }

  if (state.isRegistered) {
    return;
  }

  const hasHandler = onInvoked !== undefined;
  if (hasHandler) {
    source.onInvoked(onInvoked);
  }

  const hasIdentity = displayName !== undefined && iconPath !== undefined;
  source.register(
    hasIdentity ? {
      displayName,
      iconPath
    } : undefined
  );
  state.isRegistered = true;
}

/**
 * Shows a notification over any source of them, registering once.
 * `notify` is this over `AppNotificationManager`.
 *
 * @param options - The source, the notification, and the notifier's state.
 * @returns The id the platform gave the notification.
 * @throws {Error} When only one of `displayName` and `iconPath` is given.
 */
export function showNotification({ source, notification, state }: {
  source: NotificationSource;
  notification: NotifyOptions;
  state: { isRegistered: boolean };
}) {
  const { displayName, iconPath, onInvoked, appUserModelId, arguments: argumentRecord, ...content } = notification;
  registerNotifier({
    source,
    state,
    onInvoked,
    identity: {
      ...displayName === undefined ? {} : { displayName },
      ...iconPath === undefined ? {} : { iconPath }
    }
  });
  return source.show({
    ...content,
    arguments: new Map(Object.entries(argumentRecord ?? {}))
  });
}

/** Whether the process has registered with the platform; `notify` and the web `Notification` share it. */
export const notifierState = { isRegistered: false };

/**
 * Shows a notification in the Windows notification center, over
 * `Microsoft.Windows.AppNotifications`. The first call registers the process
 * with the platform (and starts listening for clicks, with that call's
 * `onInvoked`); later calls only show.
 *
 * What works from `node.exe` is not settled here: the platform ties a
 * notification to an app identity, and a process without package identity has
 * none of its own. Unpackaged apps must register with a display name and an
 * icon file (`displayName` and `iconPath`), and an `appUserModelId` (the same
 * one the window takes) keeps the app's notifications apart from Node's. This
 * is built on the documented API and checked only against stand-ins;
 * `test/app.test.ts` shows one for a desktop session to look at.
 *
 * @param options - The notification and, on the first call, its registration.
 * @returns The id the platform gave the notification.
 * @throws {Error} When the platform does not support app notifications for this process.
 */
export function notify(options: NotifyOptions) {
  if (!AppNotificationManager.isSupported()) {
    throw new Error("app notifications are not supported for this process");
  }

  const { appUserModelId } = options;
  const isNamedBeforeRegistering = appUserModelId !== undefined && !notifierState.isRegistered;
  if (isNamedBeforeRegistering) {
    joinAppUserModel(appUserModelId);
  }

  return showNotification({
    source: windowsNotificationSource(),
    notification: options,
    state: notifierState
  });
}
