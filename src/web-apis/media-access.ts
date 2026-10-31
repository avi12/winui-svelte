import { PermissionName, PermissionStateName } from "./permissions.ts";
import { DeviceClass } from "#src/devices/bindings.js";
import { DeviceAccessStatus, getDeviceAccess } from "#src/devices/device-access.js";

/** The two capture permissions of the Permissions API that Windows gates with privacy switches. */
export const MediaPermission = {
  CAMERA: PermissionName.CAMERA,
  MICROPHONE: PermissionName.MICROPHONE
} as const;
/** One of the values of `MediaPermission`. */
export type MediaPermission = (typeof MediaPermission)[keyof typeof MediaPermission];

const deviceClasses = {
  camera: DeviceClass.VideoCapture,
  microphone: DeviceClass.AudioCapture
} satisfies Record<MediaPermission, DeviceClass>;

/**
 * Reads the Windows privacy switch of the camera or the microphone as a
 * Permissions API state: allowed is `granted`, denied by the user or the
 * system is `denied`, and anything undecided is `prompt`.
 *
 * @param permission - Which capture permission to read.
 * @returns The state.
 */
export function windowsMediaAccess(permission: MediaPermission) {
  const { status } = getDeviceAccess(deviceClasses[permission]);
  const isAllowed = status === DeviceAccessStatus.allowed;
  if (isAllowed) {
    return PermissionStateName.GRANTED;
  }

  const isDenied = status === DeviceAccessStatus.deniedByUser || status === DeviceAccessStatus.deniedBySystem;
  return isDenied ? PermissionStateName.DENIED : PermissionStateName.PROMPT;
}
