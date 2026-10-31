/**
 * The bytes of a `BufferSource` (an `ArrayBuffer` or any view of one), copied
 * so a later change to the caller's buffer does not reach a device.
 *
 * @param source - The buffer or view.
 * @returns A fresh `Uint8Array` of the same bytes.
 */
export function bytesOfBufferSource(source: BufferSource) {
  const isView = ArrayBuffer.isView(source);
  if (isView) {
    return new Uint8Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
  }

  return new Uint8Array(source.slice(0));
}

/**
 * A `DataView` over a copy of the bytes: the form Web APIs hand values back in.
 *
 * @param bytes - The bytes.
 * @returns The view.
 */
export function dataViewOf(bytes: Uint8Array) {
  return new DataView(bytes.slice().buffer);
}
