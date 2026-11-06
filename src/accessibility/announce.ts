import { LivePriority } from "./live-priority.ts";
import { raiseAnnouncement } from "./notification.ts";
import { projectAs, releaseProjected } from "#winui/lifetime";
import {
  FrameworkElementAutomationPeer
} from "#winui/microsoft/ui/xaml/automation/peers/FrameworkElementAutomationPeer";
import { VisualTreeHelper } from "#winui/microsoft/ui/xaml/media/VisualTreeHelper";
import { UIElement } from "#winui/microsoft/ui/xaml/UIElement";

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

// A layout panel has no automation peer; the notification is raised from the
// nearest element above it that has one.
function nearestPeer(element: UIElement) {
  const projected: UIElement[] = [];
  try {
    for (let current = element; ; current = projected[projected.length - 1] ?? current) {
      const peer = peerOf(current);
      const isFound = peer != null;
      if (isFound) {
        return peer;
      }

      const parent = VisualTreeHelper.getParent(current);
      const isRoot = parent == null;
      if (isRoot) {
        throw new Error("announce needs an element in a window, with an automation peer or under one");
      }

      projected.push(projectAs(parent, UIElement));
    }
  } finally {
    for (const parent of projected) {
      releaseProjected(parent);
    }
  }
}

/**
 * Says something to a screen reader without moving focus: a UI Automation
 * notification (`AutomationPeer.RaiseNotificationEvent`), as writing to an
 * `aria-live` region, `role="status"` (polite) or `role="alert"` (assertive).
 * A layout panel has no automation peer, so the notification is raised from
 * the nearest element above it that has one.
 *
 * @param options - The message, the element to raise it from and the priority.
 */
export function announce({ message, element, priority = LivePriority.POLITE }: AnnounceOptions) {
  raiseAnnouncement({
    peer: nearestPeer(element),
    message,
    priority
  });
}
