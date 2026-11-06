import { LivePriority } from "./live-priority.ts";
import { call } from "#src/renderer/host/reflect.js";

// The bindings type AutomationNotificationKind and AutomationNotificationProcessing as
// opaque classes (the late binding run emits enums that way), though the values are the
// numbers below, WinUI's own.
const NOTIFICATION_KIND_OTHER = 4;
const PROCESSING_IMPORTANT_MOST_RECENT = 1;
const PROCESSING_MOST_RECENT = 3;
/** The activity id every notification of `announce` carries, so a listener can pick them out of the desktop's. */
export const ANNOUNCE_ACTIVITY_ID = "winui-svelte.announce";

const processingOf = {
  [LivePriority.POLITE]: PROCESSING_MOST_RECENT,
  [LivePriority.ASSERTIVE]: PROCESSING_IMPORTANT_MOST_RECENT
} as const;

/**
 * Raises a message on an automation peer as `AutomationPeer.RaiseNotificationEvent`
 * (kind Other; most recent wins for polite, important for assertive).
 *
 * @param options - The peer, the text and the priority; `OFF` and an empty text raise nothing.
 */
export function raiseAnnouncement({ peer, message, priority }: {
  peer: object;
  message: string;
  priority: LivePriority;
}) {
  const isSpoken = priority !== LivePriority.OFF && message !== "";
  if (!isSpoken) {
    return;
  }

  call(peer, "raiseNotificationEvent", NOTIFICATION_KIND_OTHER, processingOf[priority], message, ANNOUNCE_ACTIVITY_ID);
}
