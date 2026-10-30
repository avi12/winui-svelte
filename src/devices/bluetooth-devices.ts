import {
  BluetoothAdapter,
  BluetoothDevice,
  BluetoothLEDevice,
  DeviceInformation,
  DeviceInformationKind
} from "./bindings.ts";
import { addressText } from "./bluetooth-address.ts";
import { snapshotOf } from "./device-snapshot.ts";
import type { DeviceWatcherOptions } from "./device-watcher.svelte.ts";
import { deviceWatcher } from "./device-watcher.svelte.ts";

/** Which Bluetooth transport a device list is about. */
export const BluetoothTransport = {
  classic: "classic",
  lowEnergy: "lowEnergy"
} as const;
/** One of `BluetoothTransport`'s values. */
export type BluetoothTransport = typeof BluetoothTransport[keyof typeof BluetoothTransport];

/**
 * The properties worth asking for when listing Bluetooth devices
 * (`requestedProperties` of `deviceWatcher` and `findAllDevices`).
 */
export const BLUETOOTH_DEVICE_PROPERTIES = [
  "System.Devices.Aep.DeviceAddress",
  "System.Devices.Aep.IsConnected",
  "System.Devices.Aep.IsPaired",
  "System.Devices.Aep.SignalStrength",
  "System.Devices.Aep.Bluetooth.Le.IsConnectable"
] as const;

/**
 * The selector for the devices of a transport that are paired, or not paired
 * (WinRT's `BluetoothDevice.GetDeviceSelectorFromPairingState` and the Low
 * Energy twin). Pass it with `kind: DeviceInformationKind.AssociationEndpoint`.
 *
 * @param options - The transport, and the pairing state to list.
 * @returns An Advanced Query Syntax filter.
 */
export function bluetoothDeviceSelector({ transport, isPaired }: {
  transport: BluetoothTransport;
  isPaired: boolean;
}) {
  const isClassic = transport === BluetoothTransport.classic;
  const transportClass = isClassic ? BluetoothDevice : BluetoothLEDevice;
  return transportClass.getDeviceSelectorFromPairingState(isPaired);
}

/** What `bluetoothDevices` takes. */
export interface BluetoothDevicesOptions extends Pick<DeviceWatcherOptions, "deliver" | "signal" | "createSource"> {
  readonly transport: BluetoothTransport;
  readonly isPaired: boolean;
}

/**
 * Watches the Bluetooth devices the system knows, paired or not paired
 * (`deviceWatcher` with the selector, kind and properties set). This lists
 * what Windows has seen; it does not scan the air (use `bluetoothScanner`)
 * and does not pair.
 *
 * @param options - The transport and the pairing state to list.
 * @returns A device watcher; see `deviceWatcher`.
 */
export function bluetoothDevices({ transport, isPaired, ...rest }: BluetoothDevicesOptions) {
  return deviceWatcher({
    ...rest,
    selector: bluetoothDeviceSelector({
      transport,
      isPaired
    }),
    kind: DeviceInformationKind.AssociationEndpoint,
    requestedProperties: BLUETOOTH_DEVICE_PROPERTIES
  });
}

/**
 * The pairing state of a device (`DeviceInformationPairing`): whether it is
 * paired, can pair, and at what protection level. Only reads; pairing itself
 * (`DeviceInformationPairing.PairAsync`) opens system prompts and is left to
 * the app.
 *
 * @param options - The device id (a `DeviceSnapshot.id`) and a `signal`.
 * @returns The pairing state, or null when the device has none.
 */
export async function getDevicePairing({ id, signal }: {
  id: string;
  signal?: AbortSignal;
}) {
  const kind = DeviceInformationKind.AssociationEndpoint;
  const information = await DeviceInformation.createFromIdAsync(id, [], kind, signal);
  return snapshotOf({
    information,
    requestedProperties: []
  }).pairing;
}

/** What the machine's Bluetooth adapter can do (`BluetoothAdapter`). */
export interface BluetoothAdapterInfo {
  readonly deviceId: string;
  readonly address: bigint;
  readonly addressText: string;
  readonly isClassicSupported: boolean;
  readonly isLowEnergySupported: boolean;
  readonly isCentralRoleSupported: boolean;
  readonly isPeripheralRoleSupported: boolean;
  readonly isAdvertisementOffloadSupported: boolean;
}

/**
 * Reads the default Bluetooth adapter.
 *
 * @param options - A `signal`.
 * @returns The adapter, or null when the machine has none.
 */
export async function getBluetoothAdapter({ signal }: { signal?: AbortSignal } = {}) {
  const adapter = await BluetoothAdapter.getDefaultAsync(signal);
  const isMissing = adapter == null;
  if (isMissing) {
    return null;
  }

  return {
    deviceId: adapter.deviceId,
    address: adapter.bluetoothAddress,
    addressText: addressText(adapter.bluetoothAddress),
    isClassicSupported: adapter.isClassicSupported,
    isLowEnergySupported: adapter.isLowEnergySupported,
    isCentralRoleSupported: adapter.isCentralRoleSupported,
    isPeripheralRoleSupported: adapter.isPeripheralRoleSupported,
    isAdvertisementOffloadSupported: adapter.isAdvertisementOffloadSupported
  } satisfies BluetoothAdapterInfo;
}
