import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { DynWin32, DynWin32Unsafe } from "@microsoft/dynwinrt/win32/unsafe";
import type { DynWin32Value } from "@microsoft/dynwinrt/win32/unsafe";

// The pieces every Win32 call of the package is made of: binding a function
// of a DLL, passing a pointer or a wide string, reading a result. The tray and
// the printers use them; neither binds anything when its module loads.

/** The size of a UTF-16 code unit, in bytes. */
export const WIDE_CHAR_BYTES = 2;
const NO_ADDRESS = 0n;

/** A Win32 function to bind: its DLL, name, parameter types and return type (`pointer`, `i32`, `u32`, `i64`). */
interface BindOptions {
  dll: string;
  entryPoint: string;
  parameters: string[];
  returnType: string;
}

/**
 * Binds a function of a DLL, every parameter an input (a `pointer` may be null).
 *
 * @param options - The function.
 * @returns The bound function: `invoke([...values])`.
 */
export function bind({ dll, entryPoint, parameters, returnType }: BindOptions) {
  return DynWin32Unsafe.bind({
    dll,
    entryPoint,
    parameters: parameters.map(type => ({
      type,
      direction: "in",
      nullable: type === "pointer"
    })),
    returnType
  });
}

/**
 * A pointer argument for some memory.
 *
 * @param memory - Memory allocated by `DynComRawMemory.allocate`, or null.
 * @returns The pointer value (null for null).
 */
export function pointerOf(memory: DynComRawMemory | null) {
  return DynWin32Unsafe.pointer(memory === null ? null : memory.pointer().address);
}

/**
 * Memory holding a null-terminated UTF-16 string.
 *
 * @param text - The text.
 * @returns The memory; release it when the call is done.
 */
export function wideMemory(text: string) {
  const bytes = Buffer.from(`${text}\0`, "utf16le");
  const memory = DynComRawMemory.allocate(bytes.length, WIDE_CHAR_BYTES);
  memory.writeBytes(0, bytes);
  return memory;
}

/**
 * A call's numeric return value.
 *
 * @param value - What `invoke` returned.
 * @returns The number; 0 for no value.
 */
export function numberOf(value: DynWin32Value | null) {
  return value === null ? 0 : DynWin32.toNumber(value);
}

/**
 * A call's pointer return value as an address.
 *
 * @param value - What `invoke` returned.
 * @returns The address; 0 for no value.
 */
export function addressOf(value: DynWin32Value | null) {
  return value === null ? NO_ADDRESS : DynWin32Unsafe.pointerAddress(value);
}

/**
 * Runs `use` with fresh memory and releases it afterwards, whether or not
 * `use` throws.
 *
 * @param options - The size, the alignment and the work.
 * @returns What `use` returns.
 */
export function withMemory<T>({ size, alignment, use }: {
  size: number;
  alignment: number;
  use: (memory: DynComRawMemory) => T;
}) {
  const memory = DynComRawMemory.allocate(size, alignment);
  try {
    return use(memory);
  } finally {
    memory.release();
  }
}
