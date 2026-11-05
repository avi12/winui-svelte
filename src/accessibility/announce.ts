import { LivePriority } from "./live-priority.ts";
import { raiseAnnouncement } from "./notification.ts";
import {
  FrameworkElementAutomationPeer
} from "#winui/microsoft/ui/xaml/automation/peers/FrameworkElementAutomationPeer";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";

/** What `announce` takes. */
export interface AnnounceOptions {
  /** The text a screen reader speaks. */
  readonly message: string;
  /** An element of the window the message is raised from (an `elementRef`'s `current`). */
  readonly element: UIElement;
  /** `POLITE` queues behind speech; `ASSERTIVE` interrupts; `OFF` says nothing. Polite by default. */
  readonly priority?: LivePriority | undefined;
}

function peerOf(element: UIElement) {
  const existing = FrameworkElementAutomationPeer.fromElement(element);
  return existing ?? FrameworkElementAutomationPeer.createPeerForElement(element);
}

/**
 * Says something to a screen reader without moving focus: a UI Automation
 * notification (`AutomationPeer.RaiseNotificationEvent`), as writing to an
 * `aria-live` region, `role="status"` (polite) or `role="alert"` (assertive).
 *
 * @param options - The message, the element to raise it from and the priority.
 */
export function announce({ message, element, priority = LivePriority.POLITE }: AnnounceOptions) {
  raiseAnnouncement({
    peer: peerOf(element),
    message,
    priority
  });
}
