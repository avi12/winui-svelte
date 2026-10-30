import { DeviceWatcherStatus } from "./bindings.ts";
import type { Delivery } from "./delivery.ts";
import { defaultDelivery } from "./delivery.ts";
import type { DeviceQuery, ResolvedDeviceQuery } from "./device-query.ts";
import { resolvedQuery } from "./device-query.ts";
import type { DeviceInformationLike, DeviceSnapshot } from "./device-snapshot.ts";
import { snapshotOf } from "./device-snapshot.ts";
import type { DeviceWatcherSource } from "./device-watcher-source.ts";
import { createDeviceWatcherSource, isWatcherRunning } from "./device-watcher-source.ts";
import { errorOf } from "./errors.ts";
import { createKeyedCollection } from "./keyed-collection.svelte.ts";
import { stopWhenDone } from "./scope.svelte.ts";
import { SvelteMap } from "svelte/reactivity";

/** What `deviceWatcher` takes. */
export interface DeviceWatcherOptions extends DeviceQuery {
  /** Stops the watcher when it aborts. */
  readonly signal?: AbortSignal;

  /** How a change reaches the UI thread; the default runs on its dispatcher queue. */
  readonly deliver?: Delivery;

  /** Makes the watcher; the default is WinRT's `DeviceInformation.createWatcher`. */
  readonly createSource?: (query: ResolvedDeviceQuery) => DeviceWatcherSource;
}

const ABORTED_MESSAGE = "the device watcher was aborted by the system: access was denied or the device service stopped";

/** A watcher that stopped without being asked to: access was denied, or the device service went away. */
export class DeviceWatcherAbortedError extends Error {
  override readonly name = "DeviceWatcherAbortedError";
}

/**
 * Watches devices as they arrive, change and leave (WinRT's `DeviceWatcher`
 * with its Added, Updated, Removed and EnumerationCompleted events) and keeps
 * them in a reactive collection. It starts at once. It stops when the
 * component that called it is destroyed, when `signal` aborts, and when
 * `stop()` is called.
 *
 * If the watcher cannot start or is aborted by the system, `status` becomes
 * `DeviceWatcherStatus.Aborted` and `error` says why; the devices found so
 * far stay.
 *
 * @param options - What to list (`selector`, `deviceClass` or `kind`, and the
 *   `requestedProperties` to read), and how to deliver.
 * @returns The `devices`, the watcher's `status`, and `stop`.
 */
export function deviceWatcher(options: DeviceWatcherOptions = {}) {
  const query = resolvedQuery(options);
  const { requestedProperties } = query;
  const deliver = options.deliver ?? defaultDelivery();
  const { collection: devices, put, remove } = createKeyedCollection<DeviceSnapshot>();
  const state = $state<{
    status: DeviceWatcherStatus;
    isEnumerationCompleted: boolean;
    error: Error | null;
  }>({
    status: DeviceWatcherStatus.Created,
    isEnumerationCompleted: false,
    error: null
  });
  const source = (options.createSource ?? createDeviceWatcherSource)(query);
  const informations = new SvelteMap<string, DeviceInformationLike>();
  let isStopped = false;

  function fail(error: Error) {
    state.status = DeviceWatcherStatus.Aborted;
    state.error = error;
  }

  const unsubscribes = [
    source.onAdded((_sender, information) => {
      const snapshot = snapshotOf({
        information,
        requestedProperties
      });
      deliver(() => {
        informations.set(information.id, information);
        put({
          key: information.id,
          item: snapshot
        });
      });
    }),
    source.onUpdated((_sender, update) => {
      deliver(() => {
        const information = informations.get(update.id);
        const isUnknown = information === undefined;
        if (isUnknown) {
          return;
        }

        information.update(update);
        put({
          key: update.id,
          item: snapshotOf({
            information,
            requestedProperties
          })
        });
      });
    }),
    source.onRemoved((_sender, update) => {
      deliver(() => {
        informations.delete(update.id);
        remove(update.id);
      });
    }),
    source.onEnumerationCompleted(() => {
      deliver(() => {
        state.isEnumerationCompleted = true;
        state.status = source.status;
      });
    }),
    source.onStopped(() => {
      deliver(() => {
        const isAborted = source.status === DeviceWatcherStatus.Aborted;
        state.status = source.status;

        if (isAborted) {
          state.error = new DeviceWatcherAbortedError(ABORTED_MESSAGE);
        }
      });
    })
  ];

  function stop() {
    if (isStopped) {
      return;
    }

    isStopped = true;
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }

    if (isWatcherRunning(source.status)) {
      source.stop();
    }

    state.status = DeviceWatcherStatus.Stopped;
  }

  try {
    source.start();
    state.status = source.status;
  } catch (thrown) {
    fail(errorOf(thrown));
  }

  stopWhenDone({
    stop,
    signal: options.signal
  });
  return {
    devices,
    get status() {
      return state.status;
    },
    get isEnumerationCompleted() {
      return state.isEnumerationCompleted;
    },
    get error() {
      return state.error;
    },
    stop
  };
}
