/**
 * Device interface classes by their GUID (the `GUID_DEVINTERFACE_*` constants
 * of the Windows SDK), for a `selector` that lists the devices of a kind
 * without a WinRT class of its own.
 */
export const DeviceInterfaceClass = {
  mouse: "378de44c-56ef-11d1-bc8c-00a0c91405dd",
  keyboard: "884b96c3-56ef-11d1-bc8c-00a0c91405dd",
  humanInterfaceDevice: "4d1e55b2-f16f-11cf-88cb-001111000030",
  usb: "a5dcbf10-6530-11d2-901f-00c04fb951ed",
  serialPort: "86e0d1e0-8089-11d0-9ce4-08003e301f73",
  printer: "0ecef634-6ef0-472a-8085-5ad023ecbccd"
} as const;
/** One of `DeviceInterfaceClass`'s values. */
export type DeviceInterfaceClass = typeof DeviceInterfaceClass[keyof typeof DeviceInterfaceClass];

const ENABLED_FILTER = "System.Devices.InterfaceEnabled:=System.StructuredQueryType.Boolean#True";

/**
 * The selector (an Advanced Query Syntax filter) for the enabled interfaces of
 * the given classes.
 *
 * @param classes - One or more interface classes.
 * @returns A filter for `deviceWatcher` and `findAllDevices`.
 */
export function selectorOfInterfaceClasses(...classes: readonly DeviceInterfaceClass[]) {
  const anyClass = classes.map(guid => `System.Devices.InterfaceClassGuid:="{${guid}}"`).join(" OR ");
  return `(${anyClass}) AND ${ENABLED_FILTER}`;
}
