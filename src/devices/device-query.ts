import type { DeviceClass } from "./bindings.ts";
import { DeviceInformation, DeviceInformationKind } from "./bindings.ts";

/**
 * Which devices to list, in WinRT's own terms.
 */
export interface DeviceQuery {
  /**
   * An Advanced Query Syntax filter, such as the one a WinRT class returns
   * from its `getDeviceSelector()`. Wins over `deviceClass`. Without either,
   * every device of the `kind`.
   */
  readonly selector?: string;

  /** A class WinRT knows by name: `DeviceClass.AudioRender`, `ImageScanner` and so on. */
  readonly deviceClass?: DeviceClass;

  /** What a result stands for; the default is a device interface, like WinRT's. */
  readonly kind?: DeviceInformationKind;

  /**
   * The properties to read from each device, by canonical name
   * (`System.Devices.Aep.IsConnected`). Only these appear in a snapshot.
   */
  readonly requestedProperties?: readonly string[];
}

/** A `DeviceQuery` with every choice made. */
export interface ResolvedDeviceQuery {
  readonly selector: string;
  readonly kind: DeviceInformationKind;
  readonly requestedProperties: readonly string[];
}

/**
 * Settles a query's choices: the filter text, the kind and the property names.
 *
 * @param query - What the app asked for.
 * @returns The same query with a selector, a kind and a property list.
 */
export function resolvedQuery({ selector, deviceClass, kind, requestedProperties }: DeviceQuery) {
  const hasClass = deviceClass !== undefined;
  const filter = selector ?? (hasClass ? DeviceInformation.getAqsFilterFromDeviceClass(deviceClass) : "");
  return {
    selector: filter,
    kind: kind ?? DeviceInformationKind.DeviceInterface,
    requestedProperties: requestedProperties ?? []
  } satisfies ResolvedDeviceQuery;
}
