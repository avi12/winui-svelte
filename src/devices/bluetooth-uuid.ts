import { BluetoothUuidHelper } from "./bindings.ts";

/** A UUID as WinRT writes it: lowercase hex in 8-4-4-4-12 groups, without braces. */
export type Uuid = `${string}-${string}-${string}-${string}-${string}`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * Whether the text is a UUID in the form WinRT takes and returns.
 *
 * @param text - Any text.
 * @returns True for a lowercase 8-4-4-4-12 UUID without braces.
 */
export function isUuid(text: string): text is Uuid {
  return UUID_PATTERN.test(text);
}

/**
 * The UUID written the way WinRT takes it: braces dropped, lowercase.
 *
 * @param text - A UUID as the user or a device writes it.
 * @returns The normalized UUID.
 * @throws {TypeError} When the text is not a UUID.
 */
export function uuidOf(text: string) {
  const normalized = text.trim().replace(/^\{|\}$/gu, "").toLowerCase();
  if (!isUuid(normalized)) {
    throw new TypeError(`${text} is not a UUID`);
  }

  return normalized;
}

/**
 * The 128-bit UUID of a 16-bit or 32-bit Bluetooth assigned number, on the
 * Bluetooth base UUID (`0x180f` is the Battery service).
 *
 * @param shortId - The assigned number.
 * @returns The full UUID.
 */
export function uuidOfShortId(shortId: number) {
  return uuidOf(BluetoothUuidHelper.fromShortId(shortId));
}

/**
 * The assigned number of a UUID on the Bluetooth base UUID.
 *
 * @param uuid - A UUID.
 * @returns The 16-bit or 32-bit number, or null when the UUID is not on the base.
 */
export function shortIdOfUuid(uuid: Uuid) {
  return BluetoothUuidHelper.tryGetShortId(uuid);
}
