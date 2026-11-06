import { ScheduledToastNotification, ToastNotificationManager, XmlDocument } from "./schedule-bindings.ts";
import { ticksOf } from "./windows-time.ts";

/**
 * Schedules a toast with `Windows.UI.Notifications`, which the Windows App SDK
 * manager does not offer. It works for a process with package identity only.
 *
 * @param options - The toast's XML payload, when to show it, and its tag and group.
 * @returns A handle that takes the toast out of the schedule again.
 */
export function scheduleToast({ payload, showAt, tag, group }: {
  payload: string;
  showAt: number;
  tag: string;
  group: string;
}) {
  const content = new XmlDocument();
  content.loadXml(payload);
  const toast = new ScheduledToastNotification(content, ticksOf(showAt));
  toast.tag = tag;
  toast.group = group;
  const notifier = ToastNotificationManager.createToastNotifier();
  notifier.addToSchedule(toast);
  return { cancel: () => notifier.removeFromSchedule(toast) };
}
