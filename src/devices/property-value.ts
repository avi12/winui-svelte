import { IPropertyValue, PropertyType } from "./bindings.ts";

/**
 * What a device property holds, as plain JavaScript: text, a number, a
 * boolean, a 64-bit integer (`bigint`), a time (`Date`), a GUID as text, a
 * list of text, or bytes. A value of a kind WinRT can box but this cannot
 * name is the boxed object itself.
 */
export type DeviceProperty = string | number | boolean | bigint | Date | readonly string[] | Uint8Array | object | null;

const TICKS_PER_MILLISECOND = 10_000n;
// 1601-01-01, where Windows times start, to 1970-01-01, in milliseconds.
const WINDOWS_EPOCH_OFFSET_MILLISECONDS = 11_644_473_600_000n;

/**
 * A Windows time (100 nanosecond ticks since 1601) as a `Date`.
 *
 * @param universalTime - The ticks of a WinRT `DateTime`.
 * @returns The same instant.
 */
export function dateOfWindowsTime(universalTime: bigint) {
  return new Date(Number(universalTime / TICKS_PER_MILLISECOND - WINDOWS_EPOCH_OFFSET_MILLISECONDS));
}

const readers = new Map<PropertyType, (value: IPropertyValue) => DeviceProperty>([
  [PropertyType.UInt8, value => value.getUInt8()],
  [PropertyType.Int16, value => value.getInt16()],
  [PropertyType.UInt16, value => value.getUInt16()],
  [PropertyType.Int32, value => value.getInt32()],
  [PropertyType.UInt32, value => value.getUInt32()],
  [PropertyType.Int64, value => value.getInt64()],
  [PropertyType.UInt64, value => value.getUInt64()],
  [PropertyType.Single, value => value.getSingle()],
  [PropertyType.Double, value => value.getDouble()],
  [PropertyType.Boolean, value => value.getBoolean()],
  [PropertyType.String, value => value.getString()],
  [PropertyType.Guid, value => value.getGuid()],
  [PropertyType.DateTime, value => dateOfWindowsTime(value.getDateTime().universalTime)],
  [PropertyType.StringArray, value => value.getStringArray()],
  [PropertyType.UInt8Array, value => new Uint8Array(value.getUInt8Array())]
]);

type PlainProperty = string | number | boolean | bigint | Date | readonly string[] | Uint8Array;

function isPlainValue(value: unknown): value is PlainProperty {
  const isObject = typeof value === "object";
  return !isObject || value instanceof Date || value instanceof Uint8Array || Array.isArray(value);
}

/**
 * Reads what a boxed WinRT value holds (a device property comes boxed).
 * A plain JavaScript value, such as a test's, is returned as it is.
 *
 * @param boxed - A property value from `DeviceInformation.properties`.
 * @returns The value as plain JavaScript; `null` for an empty box.
 */
export function unboxed(boxed: unknown) {
  const isEmpty = boxed === null || boxed === undefined;
  if (isEmpty) {
    return null;
  }

  if (isPlainValue(boxed)) {
    return boxed;
  }

  const value = IPropertyValue.from(boxed);
  const read = readers.get(value.type);
  const result: DeviceProperty = read === undefined ? boxed : read(value);
  return result;
}
