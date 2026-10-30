import type { Delivery } from "./delivery.ts";
import { defaultDelivery } from "./delivery.ts";
import { createSubscriber } from "svelte/reactivity";

/** Stops listening. */
export type Unsubscribe = () => void;

/** Starts listening to one source of change; `notify` is called on each. */
export type Subscription = (notify: () => void) => Unsubscribe;

/**
 * Makes a `Subscription` of a static WinRT event, which comes as an `add_`
 * and a `remove_` function with a token between them
 * (`NetworkInformation.add_NetworkStatusChanged`).
 *
 * @param events - The class's `add_X` and `remove_X`.
 * @returns The subscription.
 */
export function subscriptionOfStaticEvent<Token>({ add, remove }: {
  add: (handler: () => void) => Token;
  remove: (token: Token) => void;
}) {
  return (notify => {
    const token = add(notify);
    return () => remove(token);
  }) satisfies Subscription;
}

function notListening() {}

// Outside a packaged app WinRT can refuse a subscription (an event whose
// class needs an identity); the value is then still read live, only without
// a change notification.
function listenIfAllowed({ subscription, notify }: {
  subscription: Subscription;
  notify: () => void;
}) {
  try {
    return subscription(notify);
  } catch {
    return notListening;
  }
}

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
  deliver?: Delivery;
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
 * A subscription that fires on a timer, for state Windows raises no event for
 * (a printer going offline). The timer does not keep the process alive.
 *
 * @param milliseconds - The time between reads.
 * @returns The subscription.
 */
export function pollingSubscription(milliseconds: number) {
  return (notify => {
    const timer = setInterval(notify, milliseconds);
    timer.unref();
    return () => clearInterval(timer);
  }) satisfies Subscription;
}
