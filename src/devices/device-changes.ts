import type { DeviceQuery, ResolvedDeviceQuery } from "./device-query.ts";
import { resolvedQuery } from "./device-query.ts";
import type { DeviceWatcherSource } from "./device-watcher-source.ts";
import { createDeviceWatcherSource, isWatcherRunning } from "./device-watcher-source.ts";
import type { Subscription } from "./live.svelte.ts";

/** What `deviceChanges` takes. */
export interface DeviceChangesOptions extends DeviceQuery {
  /** Makes the watcher; the default is WinRT's `DeviceInformation.createWatcher`. */
  readonly createSource?: (query: ResolvedDeviceQuery) => DeviceWatcherSource;
}

/**
 * A subscription to the devices a query matches coming, changing and going,
 * for the runes that read something else when they do (the input devices, the
 * printers, the audio endpoints). It tells once when the first listing is
 * done, then on every change.
 *
 * @param options - Which devices to watch.
 * @returns A subscription: call it with `notify`, call what it returns to stop.
 */
export function deviceChanges(options: DeviceChangesOptions = {}) {
  const query = resolvedQuery(options);
  const createSource = options.createSource ?? createDeviceWatcherSource;
  return (notify => {
    const source = createSource(query);
    let isListed = false;
    function notifyIfListed() {
      if (isListed) {
        notify();
      }
    }
    const unsubscribes = [
      source.onAdded(notifyIfListed),
      source.onUpdated(notifyIfListed),
      source.onRemoved(notifyIfListed),
      source.onEnumerationCompleted(() => {
        isListed = true;
        notify();
      })
    ];
    source.start();
    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }

      if (isWatcherRunning(source.status)) {
        source.stop();
      }
    };
  }) satisfies Subscription;
}
