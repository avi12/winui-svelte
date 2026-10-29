import { joinAppUserModel } from "#src/window/native.js";
import { AppNotificationBuilder, AppNotificationManager, Uri } from "#src/winui.js";
import { pathToFileURL } from "node:url";

const ARGUMENT_SEPARATOR = ";";
const PAIR_SEPARATOR = "=";

/** A click on a notification (or one of its buttons), as the app hears it. */
export interface NotificationInvocation {
  /** The raw argument string the notification carried. */
  readonly argument: string;

  /** The `arguments` the notification was shown with, read back. */
  readonly arguments: ReadonlyMap<string, string>;
}

/** What `notify` takes. */
export interface NotifyOptions {
  /** The first line, in bold. */
  readonly title: string;

  /** The text under it. */
  readonly body?: string;

  /** With `group`, names the notification so a later one can replace or remove it. */
  readonly tag?: string;

  /** See `tag`. */
  readonly group?: string;

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
export interface NotificationSpec {
  readonly title: string;
  readonly body?: string;
  readonly tag?: string;
  readonly group?: string;
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

/**
 * Reads the argument string a notification was built with back into pairs.
 *
 * @param argument - The `key=value;key=value` text.
 * @returns The pairs.
 */
export function argumentsOf(argument: string) {
  const pairs = argument.split(ARGUMENT_SEPARATOR).filter(pair => pair.length > 0).map(pair => {
    const iSeparator = pair.indexOf(PAIR_SEPARATOR);
    const isFlag = iSeparator < 0;
    if (isFlag) {
      return [pair, ""] as const;
    }

    return [pair.slice(0, iSeparator), pair.slice(iSeparator + 1)] as const;
  });
  return new Map<string, string>(pairs);
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
  const { displayName, iconPath, onInvoked, title, body, tag, group } = notification;
  const hasHalfIdentity = (displayName === undefined) !== (iconPath === undefined);
  if (hasHalfIdentity) {
    throw new Error("notify takes displayName and iconPath together or neither");
  }

  if (!state.isRegistered) {
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

  return source.show({
    title,
    arguments: new Map(Object.entries(notification.arguments ?? {})),
    ...body === undefined ? {} : { body },
    ...tag === undefined ? {} : { tag },
    ...group === undefined ? {} : { group }
  });
}

function managerSource() {
  const manager = AppNotificationManager.default_;
  return {
    register(identity) {
      const isUnidentified = identity === undefined;
      if (isUnidentified) {
        manager.register();
        return;
      }

      manager.register(identity.displayName, new Uri(pathToFileURL(identity.iconPath).href));
    },
    show(spec) {
      const builder = AppNotificationBuilder.create().addText(spec.title);
      const { body, tag, group } = spec;
      const hasBody = body !== undefined;
      if (hasBody) {
        builder.addText(body);
      }

      for (const [key, value] of spec.arguments) {
        builder.addArgument(key, value);
      }

      const hasTag = tag !== undefined;
      if (hasTag) {
        builder.setTag(tag);
      }

      const hasGroup = group !== undefined;
      if (hasGroup) {
        builder.setGroup(group);
      }

      const notification = builder.buildNotification();
      manager.show(notification);
      return notification.id;
    },
    onInvoked(callback) {
      return manager.onNotificationInvoked((_sender, args) => {
        callback({
          argument: args.argument,
          arguments: argumentsOf(args.argument)
        });
      });
    }
  } satisfies NotificationSource;
}

const processState = { isRegistered: false };

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
  const isNamedBeforeRegistering = appUserModelId !== undefined && !processState.isRegistered;
  if (isNamedBeforeRegistering) {
    joinAppUserModel(appUserModelId);
  }

  return showNotification({
    source: managerSource(),
    notification: options,
    state: processState
  });
}
