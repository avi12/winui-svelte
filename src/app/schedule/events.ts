import type { Alarm } from "./alarm.ts";

/** What `chrome.events.Event` offers a listener. */
export interface ListenerEvent<T extends (...values: never[]) => unknown> {
  /** Calls `listener` each time the event happens. */
  addListener(listener: T): void;

  /** Stops calling `listener`. */
  removeListener(listener: T): void;

  /** Whether `listener` is added. */
  hasListener(listener: T): boolean;
}

class Listeners<T extends (...values: never[]) => unknown> implements ListenerEvent<T> {
  private readonly listeners = new Set<T>();

  addListener(listener: T) {
    this.listeners.add(listener);
  }

  removeListener(listener: T) {
    this.listeners.delete(listener);
  }

  hasListener(listener: T) {
    return this.listeners.has(listener);
  }

  all() {
    return [...this.listeners];
  }
}

const alarmListeners = /* @__PURE__ */ new Listeners<(alarm: Alarm) => unknown>();
const startupListeners = /* @__PURE__ */ new Listeners<() => unknown>();

/**
 * Fires when an alarm goes off, as `chrome.alarms.onAlarm` does: the task
 * relaunches the app, and `startActivation` tells the listeners of the copy
 * that is running (the new one, or the first when the app was already open).
 */
export const onAlarm: ListenerEvent<(alarm: Alarm) => unknown> = alarmListeners;

/**
 * Fires when Windows starts the app at sign-in (see `launchAtLogin`), as
 * `chrome.runtime.onStartup` does.
 */
export const onStartup: ListenerEvent<() => unknown> = startupListeners;

/**
 * Tells the `onAlarm` listeners; `startActivation` calls it.
 *
 * @param alarm - The alarm that went off.
 */
export function dispatchAlarm(alarm: Alarm) {
  for (const listener of alarmListeners.all()) {
    listener(alarm);
  }
}

/** Tells the `onStartup` listeners; `startActivation` calls it. */
export function dispatchStartup() {
  for (const listener of startupListeners.all()) {
    listener();
  }
}
