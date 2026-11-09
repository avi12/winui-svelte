import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { DynWin32, DynWin32Unsafe } from "@microsoft/dynwinrt/win32/unsafe";
import type { DynWin32Value } from "@microsoft/dynwinrt/win32/unsafe";

// The pieces every Win32 call of the package is made of: binding a function
// of a DLL, passing a pointer or a wide string, reading a result. The tray,
// the printers, the drag cursor and the window use them.

/** The size of a UTF-16 code unit, in bytes. */
export const WIDE_CHAR_BYTES = 2;
/** The size of a pointer, in bytes. */
export const POINTER_BYTES = 8;

/** The size of a DWORD or a 32-bit integer, in bytes. */
export const DWORD_BYTES = 4;

/** The address of a null pointer. */
export const NO_ADDRESS = 0n;

/** A Win32 function to bind: its DLL, name, parameter types and return type (`pointer`, `i32`, `u32`, `i64`). */
interface BindOptions {
  dll: string;
  entryPoint: string;
  parameters: string[];
  returnType: string;

  /** Keep the thread's last error of the call, which `invoke` then reports as `lastError`. */
  shouldCaptureLastError?: boolean;
}

/**
 * Binds a function of a DLL, every parameter an input (a `pointer` may be null).
 *
 * @param options - The function.
 * @returns The bound function: `invoke([...values])`.
 */
export function bind({ dll, entryPoint, parameters, returnType, shouldCaptureLastError = false }: BindOptions) {
  return DynWin32Unsafe.bind({
    dll,
    entryPoint,
    parameters: parameters.map(type => ({
      type,
      direction: "in",
      nullable: type === "pointer"
    })),
    returnType,
    captureLastError: shouldCaptureLastError
  });
}

/** The types a parameter of a bound function can have. */
type ValueType = "pointer" | "u32" | "i32" | "i64";

/** What a call passes for each type; a `pointer` takes memory, an address, null or a string (wide). */
interface Arguments {
  readonly pointer: bigint | string | DynComRawMemory | null;
  readonly u32: number;
  readonly i32: number;
  readonly i64: bigint;
}

/** What a call returns for each type: an address for a `pointer`, a number for an integer. */
interface Results {
  readonly pointer: bigint;
  readonly u32: number;
  readonly i32: number;
}

/** A function of a DLL as a table row: its entry point, parameter types and return type. */
type Signature = readonly [entryPoint: string, parameters: readonly ValueType[], returnType: keyof Results];

type Argument = Arguments[ValueType];

type ArgumentsOf<Parameters extends readonly ValueType[]> = {
  readonly [Index in keyof Parameters]: Arguments[Parameters[Index]];
};

function argumentOf({ type, value }: {
  readonly type: ValueType;
  readonly value: Argument;
}) {
  const isText = typeof value === "string";
  if (isText) {
    return DynWin32.wideString(value);
  }

  const isMemory = value === null || value instanceof DynComRawMemory;
  if (isMemory) {
    return pointerOf(value);
  }

  const isWide = typeof value === "bigint";
  if (isWide) {
    return type === "pointer" ? DynWin32Unsafe.pointer(value) : DynWin32.i64(value);
  }

  return type === "u32" ? DynWin32.u32(value) : DynWin32.i32(value);
}

/**
 * Binds several functions of one DLL, each under the name of its row. A
 * call takes plain values, one per parameter in the row's types, and gives
 * back the number or the address, so no call site wraps or unwraps.
 *
 * @param options - `dll`: the DLL; `functions`: one `[entryPoint, parameters, returnType]` row per name.
 * @returns The functions by name.
 */
export function bindDll<const Functions extends Readonly<Record<string, Signature>>>({ dll, functions }: {
  readonly dll: string;
  readonly functions: Functions;
}) {
  const rows = Object.entries<Signature>(functions).map(([name, [entryPoint, parameters, returnType]]) => {
    const bound = bind({
      dll,
      entryPoint,
      parameters: [...parameters],
      returnType
    });
    function call(...values: readonly Argument[]) {
      const wrapped = parameters.map((type, i) => argumentOf({
        type,
        value: values[i] ?? null
      }));
      const { returnValue } = bound.invoke(wrapped);
      return returnType === "pointer" ? addressOf(returnValue) : numberOf(returnValue);
    }

    return [name, call] as const;
  });
  type Called = {
    readonly [Name in keyof Functions]: (...values: ArgumentsOf<Functions[Name][1]>) => Results[Functions[Name][2]];
  };
  // oxlint-disable-next-line typescript/consistent-type-assertions -- Object.fromEntries loses the types of each row
  return Object.fromEntries(rows) as unknown as Called;
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
