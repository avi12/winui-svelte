import type { Delivery } from "./delivery.ts";
import { defaultDelivery } from "./delivery.ts";
import { listenIfAllowed } from "./subscription.ts";
import type { Subscription } from "./subscription.ts";
import { createSubscriber } from "svelte/reactivity";

export type { Subscription, Unsubscribe } from "./subscription.ts";
export { pollingSubscription, subscriptionOfStaticEvent } from "./subscription.ts";

/**
 * Ties a set of native events to Svelte's reactivity: the function it returns,
 * called in a getter, makes an effect that reads the getter re-run when any of
 * the events fires, and listens only while some effect reads. Outside an
 * effect a getter just reads.
 *
 * @param options - The events, and how a change reaches the UI thread.
 * @returns The function to call in each getter of the rune.
 */
export function liveTracker({ subscriptions, deliver = defaultDelivery() }: {
  subscriptions: readonly Subscription[];
  deliver?: Delivery | undefined;
}) {
  return createSubscriber(update => {
    function notify() {
      deliver(update);
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
  });
}

/**
 * A read that is live: `liveTracker` and the read in one function. Call it in
 * each getter of a rune.
 *
 * @param options - What to read, the events that change it, and how a change is delivered.
 * @returns A function that tracks and then reads.
 */
export function liveReader<Reading>({ read, subscriptions, deliver }: {
  read: () => Reading;
  subscriptions: readonly Subscription[];
  deliver?: Delivery | undefined;
}) {
  const track = liveTracker({
    subscriptions,
    deliver
  });
  return () => {
    track();
    return read();
  };
}
