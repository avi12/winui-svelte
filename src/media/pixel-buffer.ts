import { DynWinRtValue } from "@microsoft/dynwinrt";
import { DynComMethodSig, DynComUnsafe, WinGuid } from "@microsoft/dynwinrt/com/unsafe";
import { DynComRawMemory, DynComRawOwnedComPointer } from "@microsoft/dynwinrt/com/unsafe/raw";
import { read } from "#src/renderer/host/reflect.js";
import type { IBuffer } from "#winui/windows/storage/streams/IBuffer";

// A WinRT IBuffer has no member to write through: the way in is its
// IBufferByteAccess interface (QueryInterface, then Buffer() returns the
// address of its bytes), which a managed WinUI app reaches the same way.

const IBUFFER_BYTE_ACCESS = WinGuid.parse("905a0fef-bc53-11df-8c49-001e4fc686da");
// IUnknown has three methods, so the first one of IBufferByteAccess is slot 3.
const BUFFER_SLOT = 3;
const NATIVE_OBJECT = "_obj";
const BYTE_ALIGNMENT = 1;
const POINTER_BYTES = 8;

/**
 * Overwrites the start of a WinRT buffer with bytes.
 *
 * @param options - The buffer (a `WriteableBitmap`'s `pixelBuffer`) and the bytes.
 * @throws {RangeError} when the bytes are more than the buffer's length
 * @throws {TypeError} when the buffer is not a WinRT object
 */
export function writeBuffer({ buffer, bytes }: {
  buffer: IBuffer;
  bytes: Uint8Array;
}) {
  const isTooLong = bytes.length > buffer.length;
  if (isTooLong) {
    throw new RangeError(`${bytes.length} bytes do not fit a buffer of ${buffer.length}`);
  }

  const native = read(buffer, NATIVE_OBJECT);
  const isNative = native instanceof DynWinRtValue;
  if (!isNative) {
    throw new TypeError("the buffer is not a WinRT object");
  }

  const access = DynComRawOwnedComPointer.queryInterface(native, IBUFFER_BYTE_ACCESS);
  const managed = access.intoManaged(IBUFFER_BYTE_ACCESS);
  try {
    const slot = DynComUnsafe.registerIUnknownInterface("IBufferByteAccess", IBUFFER_BYTE_ACCESS)
      .addMethodAt(BUFFER_SLOT, "Buffer", new DynComMethodSig().addIn(DynComUnsafe.unclassifiedPointerType()))
      .method(BUFFER_SLOT);
    const result = DynComRawMemory.allocate(POINTER_BYTES, POINTER_BYTES);
    try {
      slot.invoke(managed, [DynComUnsafe.pointer(result.pointer().address)]);
      const memory = DynComRawMemory.fromUnsafeAddress(result.readU64(0), buffer.length, BYTE_ALIGNMENT);
      memory.writeBytes(0, Buffer.from(bytes));
    } finally {
      result.release();
    }
  } finally {
    managed.release();
  }
}
