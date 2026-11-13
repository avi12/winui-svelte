import type { GattCharacteristic, GattDeviceService, IBuffer } from "./bindings.ts";
import {
  BluetoothCacheMode,
  BluetoothLEDevice,
  GattClientCharacteristicConfigurationDescriptorValue,
  GattCommunicationStatus,
  GattWriteOption
} from "./bindings.ts";
import { addressText } from "./bluetooth-address.ts";
import { bufferOf, bytesOf } from "./buffers.ts";

/** A Bluetooth LE call that did not succeed. */
export class BluetoothLowEnergyError extends Error {
  override readonly name = "BluetoothLowEnergyError";
  readonly status: GattCommunicationStatus | null;

  constructor({ message, status }: {
    message: string;
    status: GattCommunicationStatus | null;
  }) {
    super(message);
    this.status = status;
  }
}

function requireSuccess({ status, action }: {
  status: GattCommunicationStatus;
  action: string;
}) {
  const isSuccess = status === GattCommunicationStatus.Success;
  if (isSuccess) {
    return;
  }

  const reason = new Map<GattCommunicationStatus, string>([
    [GattCommunicationStatus.Unreachable, "the device is out of range or disconnected"],
    [GattCommunicationStatus.ProtocolError, "the device answered with a protocol error"],
    [GattCommunicationStatus.AccessDenied, "access was denied (the device needs pairing, or the app has no Bluetooth access)"]
  ]).get(status) ?? "the call failed";
  throw new BluetoothLowEnergyError({
    message: `${action}: ${reason}`,
    status
  });
}

/**
 * Opens a Bluetooth LE device by its address
 * (`BluetoothLEDevice.FromBluetoothAddressAsync`). This starts a connection
 * when a service is asked for, not here. Close the device when done
 * (`device.close()`), or the system keeps the connection.
 *
 * @param options - The device's address (`bigint`) and a `signal`.
 * @returns The WinRT device.
 * @throws {BluetoothLowEnergyError} When no such device is known.
 */
export async function openBluetoothLEDevice({ address, signal }: {
  address: bigint;
  signal?: AbortSignal;
}) {
  const device = await BluetoothLEDevice.fromBluetoothAddressAsync(address, signal);
  const isMissing = device == null;
  if (isMissing) {
    throw new BluetoothLowEnergyError({
      message: `no Bluetooth LE device at ${addressText(address)}`,
      status: null
    });
  }

  return device;
}

/**
 * The GATT services of a device, asking the device unless they are cached.
 *
 * @param options - The device, whether to use the cache, and a `signal`.
 * @returns The services.
 * @throws {BluetoothLowEnergyError} When the device is unreachable or refuses.
 */
export async function getGattServices({ device, cacheMode = BluetoothCacheMode.Uncached, signal }: {
  device: BluetoothLEDevice;
  cacheMode?: BluetoothCacheMode;
  signal?: AbortSignal;
}) {
  const result = await device.getGattServicesAsync(cacheMode, signal);
  requireSuccess({
    status: result.status,
    action: "reading the GATT services"
  });
  return [...result.services ?? []];
}

/**
 * The characteristics of a GATT service.
 *
 * @param options - The service, whether to use the cache, and a `signal`.
 * @returns The characteristics.
 * @throws {BluetoothLowEnergyError} When the device is unreachable or refuses.
 */
export async function getGattCharacteristics({ service, cacheMode = BluetoothCacheMode.Uncached, signal }: {
  service: GattDeviceService;
  cacheMode?: BluetoothCacheMode;
  signal?: AbortSignal;
}) {
  const result = await service.getCharacteristicsAsync(cacheMode, signal);
  requireSuccess({
    status: result.status,
    action: "reading the GATT characteristics"
  });
  return [...result.characteristics ?? []];
}

/**
 * Reads a characteristic's value. This talks to the device.
 *
 * @param options - The characteristic and a `signal`.
 * @returns The value's bytes.
 * @throws {BluetoothLowEnergyError} When the read fails: the characteristic is not
 *   readable, the device needs pairing, or it is unreachable.
 */
export async function readCharacteristic({ characteristic, signal }: {
  characteristic: GattCharacteristic;
  signal?: AbortSignal;
}) {
  const result = await characteristic.readValueAsync(BluetoothCacheMode.Uncached, signal);
  requireSuccess({
    status: result.status,
    action: "reading the characteristic"
  });
  return bytesOf(result.value);
}

/**
 * Writes a characteristic's value. This changes the device.
 *
 * @param options - The characteristic, the bytes, whether to skip the device's acknowledgement, and a `signal`.
 * @throws {BluetoothLowEnergyError} When the write fails.
 */
export async function writeCharacteristic({ characteristic, value, isWithoutResponse = false, signal }: {
  characteristic: GattCharacteristic;
  value: Uint8Array;
  isWithoutResponse?: boolean;
  signal?: AbortSignal;
}) {
  const option = isWithoutResponse ? GattWriteOption.WriteWithoutResponse : GattWriteOption.WriteWithResponse;
  const status = await characteristic.writeValueAsync(bufferOf(value), option, signal);
  requireSuccess({
    status,
    action: "writing the characteristic"
  });
}

/** How a device announces a changed value: a notification, or an indication the app acknowledges. */
export const NotificationMode = {
  notify: GattClientCharacteristicConfigurationDescriptorValue.Notify,
  indicate: GattClientCharacteristicConfigurationDescriptorValue.Indicate
} as const;
/** One of `NotificationMode`'s values. */
export type NotificationMode = typeof NotificationMode[keyof typeof NotificationMode];

/** The part of a characteristic that notifications use; a test stands in for it. */
export interface NotifyingCharacteristic {
  writeClientCharacteristicConfigurationDescriptorAsync(
    value: GattClientCharacteristicConfigurationDescriptorValue,
    signal?: AbortSignal
  ): Promise<GattCommunicationStatus>;
  onValueChanged(callback: (sender: unknown, args: { readonly characteristicValue: IBuffer }) => void): () => void;
}

/**
 * Subscribes to a characteristic's value changes (`GattCharacteristic.ValueChanged`
 * after writing its Client Characteristic Configuration descriptor). This
 * changes the device's configuration for the connection.
 *
 * @param options - The characteristic, `onValue`, and `mode`.
 * @returns `stop`, which unsubscribes and tells the device to stop.
 * @throws {BluetoothLowEnergyError} When the device refuses (the characteristic does not notify).
 */
export async function subscribeToCharacteristic({ characteristic, onValue, mode = NotificationMode.notify }: {
  characteristic: NotifyingCharacteristic;
  onValue: (value: Uint8Array) => void;
  mode?: NotificationMode;
}) {
  const unsubscribe = characteristic.onValueChanged((_sender, args) => onValue(bytesOf(args.characteristicValue)));
  const status = await characteristic.writeClientCharacteristicConfigurationDescriptorAsync(mode);
  try {
    requireSuccess({
      status,
      action: "subscribing to the characteristic"
    });
  } catch (thrown) {
    unsubscribe();
    throw thrown;
  }

  return async function stop() {
    unsubscribe();
    const off = GattClientCharacteristicConfigurationDescriptorValue.None;
    await characteristic.writeClientCharacteristicConfigurationDescriptorAsync(off);
  };
}

/**
 * A characteristic's changes as a stream: `for await (const value of
 * characteristicValues({ characteristic, signal }))`. It ends with the loop,
 * the `signal`, and unsubscribes.
 *
 * @param options - The characteristic, `mode`, and a `signal`.
 * @yields The bytes of one notification.
 */
export async function* characteristicValues({ characteristic, mode, signal }: {
  characteristic: NotifyingCharacteristic;
  mode?: NotificationMode;
  signal?: AbortSignal;
}) {
  const queue: Uint8Array[] = [];
  let wake: (() => void) | undefined;
  const stop = await subscribeToCharacteristic({
    characteristic,
    onValue(value) {
      queue.push(value);
      wake?.();
    },
    ...mode === undefined ? {} : { mode }
  });
  signal?.addEventListener("abort", () => wake?.(), { once: true });
  try {
    while (signal?.aborted !== true) {
      const next = queue.shift();
      const isEmpty = next === undefined;
      if (isEmpty) {
        await new Promise<void>(resolve => {
          wake = resolve;
        });
        continue;
      }

      yield next;
    }
  } finally {
    await stop();
  }
}
