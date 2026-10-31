import { BluetoothConnectionStatus } from "./hardware-bindings.ts";
import type { BluetoothAdvertisement } from "#src/devices/bluetooth.js";
import {
  BluetoothLowEnergyError,
  BluetoothScanAbortedError,
  GattCommunicationStatus,
  getBluetoothAdapter,
  getGattCharacteristics,
  getGattServices,
  NotificationMode,
  openBluetoothLEDevice,
  readCharacteristic,
  scanBluetoothAdvertisements,
  subscribeToCharacteristic,
  uuidOf,
  writeCharacteristic
} from "#src/devices/bluetooth.js";
import { bufferOf, bytesOf } from "#src/devices/buffers.js";

/** The `GattCharacteristicProperties` flags, by bit. */
const PropertyBit = {
  BROADCAST: 1,
  READ: 2,
  WRITE_WITHOUT_RESPONSE: 4,
  WRITE: 8,
  NOTIFY: 16,
  INDICATE: 32,
  AUTHENTICATED_SIGNED_WRITES: 64,
  RELIABLE_WRITES: 256,
  WRITABLE_AUXILIARIES: 512
} as const;

/** Why a backend call failed, in the terms the Web API maps to a `DOMException`. */
export const BluetoothFailureKind = {
  UNREACHABLE: "unreachable",
  DENIED: "denied",
  FAILED: "failed"
} as const;
/** One of the values of `BluetoothFailureKind`. */
export type BluetoothFailureKind = (typeof BluetoothFailureKind)[keyof typeof BluetoothFailureKind];

/** What a backend throws when the device or the system says no. */
export class BluetoothFailure extends Error {
  override readonly name = "BluetoothFailure";
  readonly kind: BluetoothFailureKind;

  constructor({ message, kind }: {
    message: string;
    kind: BluetoothFailureKind;
  }) {
    super(message);
    this.kind = kind;
  }
}

/** A device the scan heard: the choices `requestDevice` offers the chooser. */
export interface BluetoothCandidate {
  /** The address as `AA:BB:CC:DD:EE:FF`, which is also the `BluetoothDevice.id`. */
  readonly id: string;
  readonly address: bigint;

  /** Empty when the device did not advertise a name. */
  readonly name: string;

  /** The last advertisement heard from it. */
  readonly advertisement: BluetoothAdvertisement;
}

/** What a characteristic can do, as the flags of a GATT characteristic. */
export interface BluetoothCharacteristicFlags {
  readonly broadcast: boolean;
  readonly read: boolean;
  readonly writeWithoutResponse: boolean;
  readonly write: boolean;
  readonly notify: boolean;
  readonly indicate: boolean;
  readonly authenticatedSignedWrites: boolean;
  readonly reliableWrite: boolean;
  readonly writableAuxiliaries: boolean;
}

/** A GATT descriptor on a connected device. */
export interface BluetoothDescriptorHandle {
  readonly uuid: string;
  read(): Promise<Uint8Array>;
  write(value: Uint8Array): Promise<void>;
}

/** A GATT characteristic on a connected device. */
export interface BluetoothCharacteristicHandle {
  readonly uuid: string;
  readonly flags: BluetoothCharacteristicFlags;
  read(): Promise<Uint8Array>;
  write(options: {
    value: Uint8Array;
    isWithoutResponse: boolean;
  }): Promise<void>;

  /** Subscribes to value changes; the result unsubscribes. */
  startNotifications(onValue: (value: Uint8Array) => void): Promise<() => Promise<void>>;
  descriptors(uuid?: string): Promise<readonly BluetoothDescriptorHandle[]>;
}

/** A GATT service on a connected device. */
export interface BluetoothServiceHandle {
  readonly uuid: string;
  characteristics(uuid?: string): Promise<readonly BluetoothCharacteristicHandle[]>;
}

/** A GATT connection to one device. */
export interface BluetoothConnection {
  services(uuid?: string): Promise<readonly BluetoothServiceHandle[]>;
  close(): void;
  onDisconnected(callback: () => void): () => void;
}

/** Everything the Web Bluetooth classes need from the system; the tests give their own. */
export interface BluetoothBackend {
  isAvailable(): Promise<boolean>;

  /** Scans for a while and returns each device heard once, with its last advertisement. */
  discover(request: {
    signal?: AbortSignal;
    scanMilliseconds: number;
  }): Promise<readonly BluetoothCandidate[]>;
  connect(candidate: BluetoothCandidate): Promise<BluetoothConnection>;

  /** Reports the device's advertisements until the signal aborts. */
  watch(request: {
    candidate: BluetoothCandidate;
    onAdvertisement: (advertisement: BluetoothAdvertisement) => void;
    signal: AbortSignal;
  }): void;
}

function failureOf(thrown: unknown) {
  const isScanFailure = thrown instanceof BluetoothScanAbortedError;
  if (isScanFailure) {
    return new BluetoothFailure({
      message: thrown.message,
      kind: BluetoothFailureKind.FAILED
    });
  }

  const isBluetoothError = thrown instanceof BluetoothLowEnergyError;
  if (!isBluetoothError) {
    return thrown;
  }

  const kinds = new Map<GattCommunicationStatus | null, BluetoothFailureKind>([
    [GattCommunicationStatus.Unreachable, BluetoothFailureKind.UNREACHABLE],
    [GattCommunicationStatus.AccessDenied, BluetoothFailureKind.DENIED]
  ]);
  return new BluetoothFailure({
    message: thrown.message,
    kind: kinds.get(thrown.status) ?? BluetoothFailureKind.FAILED
  });
}

async function translating<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (thrown) {
    throw failureOf(thrown);
  }
}

function flagsOf(properties: number) {
  function has(bit: number) {
    return (properties & bit) !== 0;
  }

  return {
    broadcast: has(PropertyBit.BROADCAST),
    read: has(PropertyBit.READ),
    writeWithoutResponse: has(PropertyBit.WRITE_WITHOUT_RESPONSE),
    write: has(PropertyBit.WRITE),
    notify: has(PropertyBit.NOTIFY),
    indicate: has(PropertyBit.INDICATE),
    authenticatedSignedWrites: has(PropertyBit.AUTHENTICATED_SIGNED_WRITES),
    reliableWrite: has(PropertyBit.RELIABLE_WRITES),
    writableAuxiliaries: has(PropertyBit.WRITABLE_AUXILIARIES)
  } satisfies BluetoothCharacteristicFlags;
}

function delay({ milliseconds, signal }: {
  milliseconds: number;
  signal?: AbortSignal;
}) {
  return new Promise<void>(resolve => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function descriptorHandleOf(descriptor: Awaited<ReturnType<typeof descriptorsOf>>[number]) {
  return {
    uuid: uuidOf(descriptor.uuid),
    read: () => translating(async () => {
      const result = await descriptor.readValueAsync();
      const isSuccess = result.status === GattCommunicationStatus.Success;
      if (!isSuccess) {
        throw new BluetoothLowEnergyError({
          message: "reading the descriptor failed",
          status: result.status
        });
      }

      return bytesOf(result.value);
    }),
    write: (value: Uint8Array) => translating(async () => {
      const status = await descriptor.writeValueAsync(bufferOf(value));
      const isSuccess = status === GattCommunicationStatus.Success;
      if (!isSuccess) {
        throw new BluetoothLowEnergyError({
          message: "writing the descriptor failed",
          status
        });
      }
    })
  } satisfies BluetoothDescriptorHandle;
}

async function descriptorsOf(characteristic: Awaited<ReturnType<typeof getGattCharacteristics>>[number]) {
  const result = await characteristic.getDescriptorsAsync();
  const isSuccess = result.status === GattCommunicationStatus.Success;
  if (!isSuccess) {
    throw new BluetoothLowEnergyError({
      message: "reading the descriptors failed",
      status: result.status
    });
  }

  return [...result.descriptors ?? []];
}

function characteristicHandleOf(characteristic: Awaited<ReturnType<typeof getGattCharacteristics>>[number]) {
  const properties = characteristic.characteristicProperties;
  return {
    uuid: uuidOf(characteristic.uuid),
    flags: flagsOf(properties),
    read: () => translating(() => readCharacteristic({ characteristic })),
    write: ({ value, isWithoutResponse }) => translating(() => writeCharacteristic({
      characteristic,
      value,
      isWithoutResponse
    })),
    startNotifications(onValue) {
      const isIndication = (properties & PropertyBit.INDICATE) !== 0 && (properties & PropertyBit.NOTIFY) === 0;
      return translating(() => subscribeToCharacteristic({
        characteristic,
        onValue,
        mode: isIndication ? NotificationMode.indicate : NotificationMode.notify
      }));
    },
    async descriptors(uuid) {
      const all = await translating(() => descriptorsOf(characteristic));
      const wanted = uuid === undefined ? all : all.filter(descriptor => uuidOf(descriptor.uuid) === uuid);
      return wanted.map(descriptor => descriptorHandleOf(descriptor));
    }
  } satisfies BluetoothCharacteristicHandle;
}

/**
 * The real backend over `src/devices/bluetooth`: advertisements for
 * discovery and watching, `BluetoothLEDevice` and GATT for connections.
 *
 * @returns A backend over Windows Bluetooth.
 */
export function windowsBluetoothBackend() {
  return {
    async isAvailable() {
      const adapter = await getBluetoothAdapter();
      return adapter !== null && adapter.isLowEnergySupported;
    },
    async discover({ signal, scanMilliseconds }) {
      const found = new Map<string, BluetoothCandidate>();
      const controller = new AbortController();
      signal?.addEventListener("abort", () => controller.abort(), { once: true });
      const timeout = delay({
        milliseconds: scanMilliseconds,
        signal: controller.signal
      }).then(() => controller.abort());
      const scanning = (async () => {
        for await (const advertisement of scanBluetoothAdvertisements({ signal: controller.signal })) {
          const previous = found.get(advertisement.addressText);
          const name = advertisement.localName === "" ? previous?.name ?? "" : advertisement.localName;
          found.set(advertisement.addressText, {
            id: advertisement.addressText,
            address: advertisement.address,
            name,
            advertisement
          });
        }
      })();
      await Promise.all([timeout, translating(() => scanning)]);
      return [...found.values()];
    },
    async connect(candidate) {
      const device = await translating(() => openBluetoothLEDevice({ address: candidate.address }));
      return {
        async services(uuid) {
          const all = await translating(() => getGattServices({ device }));
          const wanted = uuid === undefined ? all : all.filter(service => uuidOf(service.uuid) === uuid);
          return wanted.map(service => ({
            uuid: uuidOf(service.uuid),
            async characteristics(characteristicUuid) {
              const characteristics = await translating(() => getGattCharacteristics({ service }));
              const kept = characteristicUuid === undefined
                ? characteristics
                : characteristics.filter(characteristic => uuidOf(characteristic.uuid) === characteristicUuid);
              return kept.map(characteristic => characteristicHandleOf(characteristic));
            }
          }));
        },
        close: () => device.close(),
        onDisconnected(callback) {
          return device.onConnectionStatusChanged(() => {
            const isDisconnected = device.connectionStatus === BluetoothConnectionStatus.Disconnected;
            if (isDisconnected) {
              callback();
            }
          });
        }
      } satisfies BluetoothConnection;
    },
    watch({ candidate, onAdvertisement, signal }) {
      async function scan() {
        for await (const advertisement of scanBluetoothAdvertisements({ signal })) {
          const isTheDevice = advertisement.address === candidate.address;
          if (isTheDevice) {
            onAdvertisement(advertisement);
          }
        }
      }

      void scan().catch(() => undefined);
    }
  } satisfies BluetoothBackend;
}
