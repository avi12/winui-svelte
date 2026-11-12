import { notificationInit } from "./notification-mapping.ts";
import type { CompleteNotificationOptions } from "./notification-mapping.ts";
import { parseChanges, parseComplete } from "./notification-schema.ts";
import { NotificationPermissionLevel } from "./notification-types.ts";
import type { ChromeNotificationOptions } from "./notification-types.ts";
import { ChromeEvent } from "#src/downloads/chrome-event.js";
import { DomErrorName } from "#src/web-apis/dom-exception.js";
import { Notification, NotificationClickEvent, NotificationPermission } from "#src/web-apis/notification.js";

const PERCENT = 100;

interface Shown {
  options: CompleteNotificationOptions;
  readonly notification: Notification;
}

function isNotFound(error: unknown) {
  return error instanceof DOMException && error.name === DomErrorName.NOT_FOUND;
}

/**
 * `chrome.notifications` over the web `Notification` of
 * `winui-svelte/web-apis/notification`, so there is one notification
 * pipeline: Windows app notifications, with the same permission. It needs
 * `installNotification()` to have run, as the web `Notification` does.
 */
export class ChromeNotifications {
  /** Fires when the user clicks the notification's body; not when `isClickable` is false. */
  readonly onClicked = new ChromeEvent<(notificationId: string) => void>();

  /** Fires when the user clicks one of the buttons, with its index. */
  readonly onButtonClicked = new ChromeEvent<(notificationId: string, buttonIndex: number) => void>();

  /**
   * Fires when a notification goes away: `byUser` is true after a click
   * (Windows removes a notification that was clicked) and false for `clear`,
   * a replacement is not reported. Windows does not report a swipe away.
   */
  readonly onClosed = new ChromeEvent<(notificationId: string, byUser: boolean) => void>();

  private readonly shown = new Map<string, Shown>();

  /**
   * Shows a notification; the same id replaces the one that is up. The first
   * call asks Windows for the permission.
   *
   * @param notificationId - Names the notification; made up when empty or missing.
   * @param options - `type`, `title` and `message` are required, and so is `imageUrl` for `image`,
   *   `items` for `list` and `progress` for `progress`; `iconUrl` is optional here.
   * @returns The id.
   * @throws {Error} For options that fail the check, or when notifications are not allowed.
   */
  async create(notificationId: string | undefined, options: ChromeNotificationOptions) {
    const complete = parseComplete(options);
    const isNamed = notificationId !== undefined && notificationId !== "";
    const id = isNamed ? notificationId : crypto.randomUUID();
    await this.show({
      id,
      options: complete
    });
    return id;
  }

  /**
   * Changes a notification that is up. A change of `progress` alone moves the
   * bar in place; anything else shows the notification again under its id.
   *
   * @param notificationId - The id `create` gave.
   * @param options - The members to change.
   * @returns False when there is no such notification.
   * @throws {Error} For options that fail the check.
   */
  async update(notificationId: string, options: ChromeNotificationOptions) {
    const changes = parseChanges(options);
    const current = this.shown.get(notificationId);
    if (!current) {
      return false;
    }

    const merged = parseComplete({
      ...current.options,
      ...changes
    });
    const isProgressOnly = Object.keys(changes).every(key => key === "progress");
    const { progress } = merged;
    const canMoveBar = isProgressOnly && current.notification.progress !== undefined && progress !== undefined;
    if (!canMoveBar) {
      await this.show({
        id: notificationId,
        options: merged
      });
      return true;
    }

    try {
      await current.notification.update({
        progress: {
          value: progress / PERCENT
        }
      });
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }

      this.shown.delete(notificationId);
      return false;
    }

    current.options = merged;
    return true;
  }

  /**
   * Takes a notification off the screen and out of the notification center.
   *
   * @param notificationId - The id `create` gave.
   * @returns False when there is no such notification.
   */
  async clear(notificationId: string) {
    const current = this.shown.get(notificationId);
    if (!current) {
      return false;
    }

    this.shown.delete(notificationId);
    current.notification.close();
    this.onClosed.dispatch(notificationId, false);
    return true;
  }

  /**
   * Lists the notifications this app has up.
   *
   * @returns An object with each id as a key and `true` as the value.
   */
  async getAll() {
    return Object.fromEntries([...this.shown.keys()].map(id => [id, true as const]));
  }

  /**
   * Reads the web `Notification.permission`.
   *
   * @returns `granted`, or `denied` when it is denied or not asked yet; the first `create` asks.
   */
  async getPermissionLevel() {
    const isGranted = Notification.permission === NotificationPermission.GRANTED;
    return isGranted ? NotificationPermissionLevel.GRANTED : NotificationPermissionLevel.DENIED;
  }

  private async show({ id, options }: {
    id: string;
    options: CompleteNotificationOptions;
  }) {
    const permission = await Notification.requestPermission();
    const isAllowed = permission === NotificationPermission.GRANTED;
    if (!isAllowed) {
      throw new Error("Notifications are not allowed for this app");
    }

    const notification = new Notification(
      options.title,
      notificationInit({
        id,
        options
      })
    );
    const entry = {
      options,
      notification
    } satisfies Shown;
    this.shown.set(id, entry);
    notification.addEventListener("close", () => this.handleClose({
      id,
      entry
    }));
    notification.addEventListener("error", () => this.forget({
      id,
      entry
    }));
    notification.addEventListener("click", event => this.handleClick({
      id,
      entry,
      event
    }));
  }

  private isCurrent({ id, entry }: {
    id: string;
    entry: Shown;
  }) {
    return this.shown.get(id) === entry;
  }

  private forget({ id, entry }: {
    id: string;
    entry: Shown;
  }) {
    const isCurrent = this.isCurrent({
      id,
      entry
    });
    if (isCurrent) {
      this.shown.delete(id);
    }

    return isCurrent;
  }

  private handleClose({ id, entry }: {
    id: string;
    entry: Shown;
  }) {
    const isCurrentEntry = this.forget({
      id,
      entry
    });
    if (isCurrentEntry) {
      this.onClosed.dispatch(id, false);
    }
  }

  private handleClick({ id, entry, event }: {
    id: string;
    entry: Shown;
    event: Event;
  }) {
    const isCurrentEntry = this.forget({
      id,
      entry
    });
    const isHeard = isCurrentEntry && event instanceof NotificationClickEvent;
    if (!isHeard) {
      return;
    }

    const isButton = event.action !== "";
    const isClickable = entry.options.isClickable !== false;
    if (isButton) {
      this.onButtonClicked.dispatch(id, Number(event.action));
    } else if (isClickable) {
      this.onClicked.dispatch(id);
    }

    this.onClosed.dispatch(id, true);
  }
}
