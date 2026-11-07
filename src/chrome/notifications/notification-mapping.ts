import { NotificationTemplateType } from "./notification-types.ts";
import type { ChromeNotificationOptions } from "./notification-types.ts";
import type { NotificationInit } from "#src/web-apis/notification.js";

const PERCENT = 100;
const URGENT_PRIORITY = 2;

/** The options of a complete notification: what the schema checked. */
export interface CompleteNotificationOptions extends ChromeNotificationOptions {
  readonly type: NotificationTemplateType;
  readonly title: string;
  readonly message: string;
}

function bodyOf(options: CompleteNotificationOptions) {
  const lines = options.type === NotificationTemplateType.LIST
    ? options.items?.map(item => `${item.title}: ${item.message}`) ?? []
    : [];
  return [options.message, ...lines].join("\n");
}

function isSilent(options: CompleteNotificationOptions) {
  const isLowPriority = options.priority !== undefined && options.priority < 0;
  return options.silent ?? (isLowPriority || undefined);
}

function isInteractionRequired(options: CompleteNotificationOptions) {
  return options.requireInteraction ?? options.priority === URGENT_PRIORITY;
}

/**
 * The web `Notification` options for a `chrome.notifications` notification:
 * the template decides the body, the picture and the progress bar, and the
 * buttons become actions named by their index.
 */
export function notificationInit({ id, options }: {
  id: string;
  options: CompleteNotificationOptions;
}) {
  const isQuiet = isSilent(options);
  const hasImage = options.type === NotificationTemplateType.IMAGE && options.imageUrl !== undefined;
  const hasBar = options.type === NotificationTemplateType.PROGRESS && options.progress !== undefined;
  return {
    body: bodyOf(options),
    tag: id,
    requireInteraction: isInteractionRequired(options),
    actions: (options.buttons ?? []).map((button, iButton) => ({
      action: String(iButton),
      title: button.title,
      ...button.iconUrl === undefined ? {} : { icon: button.iconUrl }
    })),
    ...options.iconUrl === undefined ? {} : { icon: options.iconUrl },
    ...hasImage ? { image: options.imageUrl ?? "" } : {},
    ...options.eventTime === undefined ? {} : { timestamp: options.eventTime },
    ...options.contextMessage === undefined ? {} : { attribution: options.contextMessage },
    ...isQuiet === undefined ? {} : { silent: isQuiet },
    ...hasBar ? {
      progress: {
        value: (options.progress ?? 0) / PERCENT
      }
    } : {}
  } satisfies NotificationInit;
}
