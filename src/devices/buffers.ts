import type { IBuffer } from "./bindings.ts";
import { CryptographicBuffer } from "./bindings.ts";

/**
 * The bytes of a WinRT buffer (`IBuffer`), copied.
 *
 * @param buffer - A buffer WinRT returned.
 * @returns The same bytes as a `Uint8Array`.
 */
export function bytesOf(buffer: IBuffer) {
  return new Uint8Array(CryptographicBuffer.copyToByteArray(buffer));
}

/**
 * A WinRT buffer holding a copy of the bytes, to hand to a call that takes an
 * `IBuffer`.
 *
 * @param bytes - The bytes.
 * @returns The buffer.
 */
export function bufferOf(bytes: Uint8Array) {
  return CryptographicBuffer.createFromByteArray(bytes);
}
