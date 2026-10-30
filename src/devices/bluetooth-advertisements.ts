import type { BluetoothLEAdvertisementType, IBuffer } from "./bindings.ts";
import {
  BluetoothLEAdvertisementWatcher,
  BluetoothLEAdvertisementWatcherStatus,
  BluetoothLEScanningMode
} from "./bindings.ts";
import { addressText } from "./bluetooth-address.ts";
import type { Uuid } from "./bluetooth-uuid.ts";
import { uuidOf } from "./bluetooth-uuid.ts";
import { bytesOf } from "./buffers.ts";
import { dateOfWindowsTime } from "./property-value.ts";

/** A section of manufacturer data: the Bluetooth SIG company id, and its bytes. */
export interface ManufacturerData {
  readonly companyId: number;
  readonly data: Uint8Array;
}

/** A section of an advertisement by its assigned data type (`0x09` is the complete local name). */
export interface AdvertisementSection {
  readonly dataType: number;
  readonly data: Uint8Array;
}

/**
 * One Bluetooth LE advertisement a scan heard, as plain values
 * (`BluetoothLEAdvertisementReceivedEventArgs`).
 */
export interface BluetoothAdvertisement {
  /** The device's 48-bit address, for `BluetoothLEDevice.fromBluetoothAddressAsync`. */
  readonly address: bigint;

  /** The address as `AA:BB:CC:DD:EE:FF`: the key a scan lists devices by. */
  readonly addressText: string;

  /** Empty when the device did not advertise a name. */
  readonly localName: string;
  readonly serviceUuids: readonly Uuid[];
  readonly manufacturerData: readonly ManufacturerData[];
  readonly dataSections: readonly AdvertisementSection[];

  /** Received signal strength in dBm; closer to 0 is stronger. */
  readonly rssi: number;

  /** The transmit power the device reported in dBm, or null. */
  readonly transmitPower: number | null;
  readonly timestamp: Date;
  readonly type: BluetoothLEAdvertisementType;
  readonly isConnectable: boolean;
  readonly isScannable: boolean;
  readonly isDirected: boolean;
  readonly isScanResponse: boolean;
  readonly isAnonymous: boolean;
}

/** The part of a received advertisement that is read; a test stands in for it. */
export interface ReceivedAdvertisementLike {
  readonly bluetoothAddress: bigint;
  readonly rawSignalStrengthInDBm: number;
  readonly transmitPowerLevelInDBm: number | null;
  readonly timestamp: { readonly universalTime: bigint };
  readonly advertisementType: BluetoothLEAdvertisementType;
  readonly isConnectable: boolean;
  readonly isScannable: boolean;
  readonly isDirected: boolean;
  readonly isScanResponse: boolean;
  readonly isAnonymous: boolean;
  readonly advertisement: {
    readonly localName: string;
    readonly serviceUuids: Iterable<string> | null;
    readonly manufacturerData: Iterable<{
      readonly companyId: number;
      readonly data: IBuffer;
    }> | null;
    readonly dataSections: Iterable<{
      readonly dataType: number;
      readonly data: IBuffer;
    }> | null;
  };
}

/**
 * Reads a received advertisement into plain values.
 *
 * @param received - What the watcher's Received event gave.
 * @returns The advertisement.
 */
export function advertisementOf(received: ReceivedAdvertisementLike) {
  const { advertisement } = received;
  return {
    address: received.bluetoothAddress,
    addressText: addressText(received.bluetoothAddress),
    localName: advertisement.localName,
    serviceUuids: [...advertisement.serviceUuids ?? []].map(uuid => uuidOf(uuid)),
    manufacturerData: [...advertisement.manufacturerData ?? []].map(section => ({
      companyId: section.companyId,
      data: bytesOf(section.data)
    })),
    dataSections: [...advertisement.dataSections ?? []].map(section => ({
      dataType: section.dataType,
      data: bytesOf(section.data)
    })),
    rssi: received.rawSignalStrengthInDBm,
    transmitPower: received.transmitPowerLevelInDBm,
    timestamp: dateOfWindowsTime(received.timestamp.universalTime),
    type: received.advertisementType,
    isConnectable: received.isConnectable,
    isScannable: received.isScannable,
    isDirected: received.isDirected,
    isScanResponse: received.isScanResponse,
    isAnonymous: received.isAnonymous
  } satisfies BluetoothAdvertisement;
}

/**
 * Which advertisements to keep. The Windows filter classes are hardware
 * filters with narrower rules; these run on each advertisement received, and
 * all that are given must match.
 */
export interface AdvertisementFilter {
  /** The advertised name contains this text (case does not matter). */
  readonly localName?: string;

  /** The device advertises at least one of these services. */
  readonly serviceUuids?: readonly Uuid[];

  /** The device sends manufacturer data of this Bluetooth SIG company. */
  readonly companyId?: number;

  /** Drop anything weaker than this many dBm. */
  readonly minimumRssi?: number;
}

/**
 * Whether an advertisement passes a filter.
 *
 * @param options - The advertisement and the filter.
 * @returns True when every part of the filter that is given matches.
 */
export function passesFilter({ advertisement, filter }: {
  advertisement: BluetoothAdvertisement;
  filter: AdvertisementFilter;
}) {
  const { localName, serviceUuids, companyId, minimumRssi } = filter;
  const isNameKept = localName === undefined || advertisement.localName.toLowerCase().includes(localName.toLowerCase());
  const isServiceKept = serviceUuids === undefined
    || serviceUuids.some(uuid => advertisement.serviceUuids.includes(uuid));
  const isCompanyKept = companyId === undefined
    || advertisement.manufacturerData.some(section => section.companyId === companyId);
  const isSignalKept = minimumRssi === undefined || advertisement.rssi >= minimumRssi;
  return isNameKept && isServiceKept && isCompanyKept && isSignalKept;
}

/**
 * The part of WinRT's `BluetoothLEAdvertisementWatcher` that a scan uses; a
 * test stands in for it.
 */
export interface AdvertisementWatcherSource {
  readonly status: BluetoothLEAdvertisementWatcherStatus;
  scanningMode: BluetoothLEScanningMode;
  start(): void;
  stop(): void;
  onReceived(callback: (sender: unknown, received: ReceivedAdvertisementLike) => void): () => void;
  onStopped(callback: () => void): () => void;
}

/** What a scan takes. */
export interface AdvertisementScanOptions {
  /**
   * Passive listens only; active also asks devices for their scan response
   * (more names, more radio use). The default is passive.
   */
  readonly scanningMode?: BluetoothLEScanningMode;
  readonly filter?: AdvertisementFilter;

  /** Ends the scan when it aborts. */
  readonly signal?: AbortSignal;

  /** Makes the watcher; the default is WinRT's. */
  readonly createSource?: () => AdvertisementWatcherSource;
}

/** What an aborted scan says. */
export const ABORTED_MESSAGE = "the Bluetooth scan was aborted: Bluetooth is off, has no adapter, or access was refused";

/**
 * A scan that ended without being asked to: Bluetooth is off or has no
 * adapter, or the system refused the radio.
 */
export class BluetoothScanAbortedError extends Error {
  override readonly name = "BluetoothScanAbortedError";
}

/**
 * Starts a Bluetooth LE advertisement scan and reports what it hears.
 *
 * @param options - The scan's settings and the callbacks.
 * @returns `stop`, which ends the scan and lets go of its events.
 * @throws When the watcher cannot start (no adapter, Bluetooth off).
 */
export function startAdvertisementScan({ options, onAdvertisement, onStopped }: {
  options: AdvertisementScanOptions;
  onAdvertisement: (advertisement: BluetoothAdvertisement) => void;
  onStopped: (status: BluetoothLEAdvertisementWatcherStatus) => void;
}) {
  const source = options.createSource?.() ?? new BluetoothLEAdvertisementWatcher();
  source.scanningMode = options.scanningMode ?? BluetoothLEScanningMode.Passive;
  const filter = options.filter ?? {};
  const unsubscribes = [
    source.onReceived((_sender, received) => {
      const advertisement = advertisementOf(received);
      if (passesFilter({
        advertisement,
        filter
      })) {
        onAdvertisement(advertisement);
      }
    }),
    source.onStopped(() => onStopped(source.status))
  ];
  let isStopped = false;
  function stop() {
    if (isStopped) {
      return;
    }

    isStopped = true;
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }

    const isRunning = source.status === BluetoothLEAdvertisementWatcherStatus.Started;
    if (isRunning) {
      source.stop();
    }
  }
  try {
    source.start();
  } catch (thrown) {
    stop();
    throw thrown;
  }

  return stop;
}

/**
 * The advertisements a scan hears, as a stream: `for await (const
 * advertisement of scanBluetoothAdvertisements({ signal }))`. The scan starts
 * when the loop starts and ends when the loop does (`break`, a throw), when
 * `signal` aborts, or when the system stops it, which throws
 * `BluetoothScanAbortedError`.
 *
 * @param options - The scan's settings.
 * @returns An async iterable of advertisements, one per advertisement heard.
 */
export async function* scanBluetoothAdvertisements(options: AdvertisementScanOptions = {}) {
  const queue: BluetoothAdvertisement[] = [];
  let wake: (() => void) | undefined;
  let isEnded = false;
  let failure: Error | undefined;
  function wakeReader() {
    wake?.();
  }
  const stop = startAdvertisementScan({
    options,
    onAdvertisement(advertisement) {
      queue.push(advertisement);
      wakeReader();
    },
    onStopped(status) {
      const isAborted = status === BluetoothLEAdvertisementWatcherStatus.Aborted;
      isEnded = true;
      failure = isAborted ? new BluetoothScanAbortedError(ABORTED_MESSAGE) : undefined;
      wakeReader();
    }
  });
  options.signal?.addEventListener("abort", () => {
    isEnded = true;
    wakeReader();
  }, { once: true });
  const isAlreadyAborted = options.signal?.aborted === true;
  if (isAlreadyAborted) {
    isEnded = true;
  }

  try {
    while (true) {
      const next = queue.shift();
      const hasNext = next !== undefined;
      if (hasNext) {
        yield next;
        continue;
      }

      if (isEnded) {
        break;
      }

      await new Promise<void>(resolve => {
        wake = resolve;
      });
    }
  } finally {
    stop();
  }

  if (failure) {
    throw failure;
  }
}
