import type { Delivery } from "#src/devices/delivery.js";
import { defaultDelivery } from "#src/devices/delivery.js";
import type { Subscription } from "#src/devices/live.svelte.js";

function stopNothing() {}

// Outside a packaged app WinRT can refuse a subscription; the value is then
// still read live, only without a change notification.
function listenIfAllowed({ subscription, notify }: {
  subscription: Subscription;
  notify: () => void;
}) {
  try {
    return subscription(notify);
  } catch {
    return stopNothing;
  }
}

/**
 * Calls `onChange` on the thread the app runs on whenever one of the native
 * events of a `src/devices` source fires; the Web API facades share it.
 *
 * @param options - The source's subscriptions, what to run, and how a change is delivered.
 * @returns The function that stops listening to all of them.
 */
export function listenToSource({ subscriptions, onChange, deliver = defaultDelivery() }: {
  subscriptions: readonly Subscription[];
  onChange: () => void;
  deliver?: Delivery;
}) {
  function notify() {
    deliver(onChange);
  }
  const stops = subscriptions.map(subscription => listenIfAllowed({
    subscription,
    notify
  }));
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}
