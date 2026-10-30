import type { DeviceClass } from "./bindings.ts";
import { DeviceAccessInformation } from "./bindings.ts";

/**
 * Whether the user and the system let the app use a class of devices
 * (`DeviceAccessStatus`).
 */
export const DeviceAccessStatus = {
  unspecified: 0,
  allowed: 1,
  deniedByUser: 2,
  deniedBySystem: 3
} as const;
/** One of `DeviceAccessStatus`'s values. */
export type DeviceAccessStatus = typeof DeviceAccessStatus[keyof typeof DeviceAccessStatus];

// The bindings type WinRT's DeviceAccessStatus as an opaque class (its metadata
// has no default interface), though the value is the number above.
const STATUS_OF_VALUE = new Map<unknown, DeviceAccessStatus>(
  Object.values(DeviceAccessStatus).map(value => [value, value])
);

/**
 * Asks Windows whether the app may use a class of devices (the microphone,
 * the camera, location, portable storage): `DeviceAccessInformation`. Reading
 * a device list needs no consent; opening a device can need it, and this says
 * ahead of time whether the answer is already no.
 *
 * @param deviceClass - A class WinRT knows by name.
 * @returns The status, and whether the user would be asked.
 */
export function getDeviceAccess(deviceClass: DeviceClass) {
  const access = DeviceAccessInformation.createFromDeviceClass(deviceClass);
  return {
    status: STATUS_OF_VALUE.get(access.currentStatus) ?? DeviceAccessStatus.unspecified,
    isPromptRequired: access.userPromptRequired
  };
}
