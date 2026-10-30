import { BluetoothLEAdvertisementWatcherStatus } from "./bindings.ts";
import type { AdvertisementScanOptions, BluetoothAdvertisement } from "./bluetooth-advertisements.ts";
import { ABORTED_MESSAGE, BluetoothScanAbortedError, startAdvertisementScan } from "./bluetooth-advertisements.ts";
import type { Delivery } from "./delivery.ts";
import { defaultDelivery } from "./delivery.ts";
import { errorOf } from "./errors.ts";
import { createKeyedCollection } from "./keyed-collection.svelte.ts";
import { stopWhenDone } from "./scope.svelte.ts";

/** What `bluetoothScanner` takes. */
export interface BluetoothScannerOptions extends AdvertisementScanOptions {
  /** How a change reaches the UI thread; the default runs on its dispatcher queue. */
  readonly deliver?: Delivery;
}

/**
 * A Bluetooth LE scan as a reactive collection: one entry per device heard,
 * by its address, holding the latest advertisement from it. `start()` begins
 * the scan; it ends with `stop()`, with the component, with `signal`, or when
 * the system stops it (`error` is then a `BluetoothScanAbortedError`: Bluetooth
 * is off, there is no adapter, or the radio was refused).
 *
 * @param options - The scan's settings (`scanningMode`, `filter`) and how to deliver.
 * @returns `advertisements` (a keyed collection for `{#each}`), `status`, `error`, `start`, `stop` and `clear`.
 */
export function bluetoothScanner(options: BluetoothScannerOptions = {}) {
  const deliver = options.deliver ?? defaultDelivery();
  const { collection: advertisements, put, clear } = createKeyedCollection<BluetoothAdvertisement>();
  const state = $state<{
    status: BluetoothLEAdvertisementWatcherStatus;
    error: Error | null;
  }>({
    status: BluetoothLEAdvertisementWatcherStatus.Created,
    error: null
  });
  let stopScan: (() => void) | undefined;

  function stop() {
    stopScan?.();
    stopScan = undefined;
    const isRunning = state.status === BluetoothLEAdvertisementWatcherStatus.Started;
    if (isRunning) {
      state.status = BluetoothLEAdvertisementWatcherStatus.Stopped;
    }
  }

  function start() {
    const isScanning = stopScan !== undefined;
    if (isScanning) {
      return;
    }

    state.error = null;
    try {
      stopScan = startAdvertisementScan({
        options,
        onAdvertisement: advertisement => deliver(() => put({
          key: advertisement.addressText,
          item: advertisement
        })),
        onStopped: status => deliver(() => {
          state.status = status;
          const isAborted = status === BluetoothLEAdvertisementWatcherStatus.Aborted;
          if (isAborted) {
            state.error = new BluetoothScanAbortedError(ABORTED_MESSAGE);
          }
        })
      });
      state.status = BluetoothLEAdvertisementWatcherStatus.Started;
    } catch (thrown) {
      state.status = BluetoothLEAdvertisementWatcherStatus.Aborted;
      state.error = errorOf(thrown);
    }
  }

  stopWhenDone({
    stop,
    signal: options.signal
  });
  return {
    advertisements,
    get status() {
      return state.status;
    },
    get isScanning() {
      return state.status === BluetoothLEAdvertisementWatcherStatus.Started;
    },
    get error() {
      return state.error;
    },
    start,
    stop,
    clear
  };
}
