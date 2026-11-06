function notListening() {}

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

// Outside a packaged app WinRT can refuse a subscription (an event whose
// class needs an identity); the value is then still read live, only without
// a change notification.
/**
 * Starts a subscription, or does nothing when WinRT refuses it.
 *
 * @param options - The subscription and what it calls.
 * @returns What stops it.
 */
export function listenIfAllowed({ subscription, notify }: {
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
