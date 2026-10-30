import type { DeviceInformationKind, DevicePairingProtectionLevel } from "./bindings.ts";
import type { DeviceProperty } from "./property-value.ts";
import { unboxed } from "./property-value.ts";

/** Whether and how a device can pair (`DeviceInformationPairing`). */
export interface DevicePairing {
  readonly isPaired: boolean;
  readonly canPair: boolean;
  readonly protectionLevel: DevicePairingProtectionLevel;
}

/**
 * One device at one moment, as plain values: what `DeviceInformation` says.
 * A change makes a new snapshot, so a keyed `{#each}` redraws the row.
 */
export interface DeviceSnapshot {
  /** The device's interface id: the key it is listed by. */
  readonly id: string;
  readonly name: string;
  readonly kind: DeviceInformationKind;
  readonly isEnabled: boolean;

  /** The default device of its class (audio, for one). */
  readonly isDefault: boolean;

  /** The properties asked for in `requestedProperties`, by their canonical name (`System.Devices.Aep.IsConnected`). */
  readonly properties: ReadonlyMap<string, DeviceProperty>;

  /** Null when the device has no pairing information. */
  readonly pairing: DevicePairing | null;
}

/** The part of a WinRT property map (`IMapView<String, Object>`) that is read. */
export interface PropertyBag {
  get(key: string): unknown;
  has(key: string): boolean;
}

/** What a snapshot reads of a `DeviceInformationUpdate`. */
export interface DeviceUpdateLike {
  readonly id: string;
  readonly kind: DeviceInformationKind;
  readonly properties: PropertyBag | null;
}

/** What a snapshot reads of a `DeviceInformation`; a test stands in for it. */
export interface DeviceInformationLike {
  readonly id: string;
  readonly name: string;
  readonly kind: DeviceInformationKind;
  readonly isEnabled: boolean;
  readonly isDefault: boolean;
  readonly properties: PropertyBag | null;
  readonly pairing: DevicePairing | null;
  update(update: DeviceUpdateLike): void;
}

/**
 * Reads a device into a snapshot.
 *
 * @param options - The device, and the property names that were asked for (a
 *   property map cannot be listed, only asked).
 * @returns The snapshot.
 */
export function snapshotOf({ information, requestedProperties }: {
  information: DeviceInformationLike;
  requestedProperties: readonly string[];
}) {
  const { properties: bag, pairing } = information;
  const properties = new Map<string, DeviceProperty>();
  for (const name of requestedProperties) {
    const isPresent = bag?.has(name) === true;
    if (isPresent) {
      properties.set(name, unboxed(bag.get(name)));
    }
  }

  return {
    id: information.id,
    name: information.name,
    kind: information.kind,
    isEnabled: information.isEnabled,
    isDefault: information.isDefault,
    properties,
    pairing: pairing === null ? null : {
      isPaired: pairing.isPaired,
      canPair: pairing.canPair,
      protectionLevel: pairing.protectionLevel
    }
  } satisfies DeviceSnapshot;
}
