import { DataProtectionError } from "./data-protection-error.ts";
import { ProtectionScope } from "./protection-scope.ts";
import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { DynWin32 } from "@microsoft/dynwinrt/win32/unsafe";
import {
  bind,
  bindDll,
  numberOf,
  pointerOf,
  wideMemory
} from "#src/win32-calls.js";

// DPAPI (`CryptProtectData`, `CryptUnprotectData`) over the Win32 seam. A
// DATA_BLOB on x64 is a u32 length, four bytes of padding, then the pointer.
// Every native buffer that held plain text is zeroed before it is released.

const BYTES_PER_MEBIBYTE = 1_048_576;
const MAX_DATA_MEBIBYTES = 64;

/** The most bytes one call seals or unseals; a `cbData` is a u32, and a larger copy is a mistake. */
export const MAX_DATA_BYTES = BYTES_PER_MEBIBYTE * MAX_DATA_MEBIBYTES;

const CRYPTPROTECT_UI_FORBIDDEN = 0x1;
const CRYPTPROTECT_LOCAL_MACHINE = 0x4;
const BLOB_BYTES = 16;
const BLOB_POINTER_OFFSET = 8;
const BYTE_ALIGNMENT = 1;
const POINTER_ALIGNMENT = 8;
const LIBRARY = "crypt32.dll";
const FLAGS_PARAMETER = 5;
const PARAMETER_COUNT = 7;

/** Allocates native memory; the seam a test swaps for one that records what is released. */
export type Allocate = (options: {
  readonly size: number;
  readonly alignment: number;
}) => DynComRawMemory;

/** Frees memory Windows allocated with `LocalAlloc`; a test sees the bytes just before they go. */
export type LocalFree = (options: {
  readonly address: bigint;
  readonly size: number;
}) => void;

/** What the helpers use of the machine; the defaults are the real ones. */
export interface DataProtectionNative {
  readonly allocate: Allocate;
  readonly localFree: LocalFree;
}

interface Input {
  readonly data: Uint8Array;
  readonly entropy?: Uint8Array | undefined;
  readonly scope?: ProtectionScope | undefined;
}

interface SealInput extends Input {
  readonly description?: string | undefined;
}

/** Allocates with dynwinrt's raw memory. */
function realAllocate({ size, alignment }: {
  readonly size: number;
  readonly alignment: number;
}) {
  return DynComRawMemory.allocate(size, alignment);
}

/** Frees what Windows allocated with `LocalAlloc`. */
function realLocalFree({ address }: {
  readonly address: bigint;
  readonly size: number;
}) {
  bindDll({
    dll: "kernel32.dll",
    functions: {
      localFree: ["LocalFree", ["pointer"], "pointer"]
    }
  }).localFree(address);
}

/** The machine's own allocator and `LocalFree`. */
export const REAL_NATIVE: DataProtectionNative = {
  allocate: realAllocate,
  localFree: realLocalFree
};

function requireSize(data: Uint8Array) {
  const isTooLarge = data.byteLength > MAX_DATA_BYTES;
  if (isTooLarge) {
    throw new RangeError(`data is over the ${MAX_DATA_BYTES} byte limit`);
  }
}

function flagsOf(scope: ProtectionScope | undefined) {
  const isMachine = scope === ProtectionScope.LOCAL_MACHINE;
  return isMachine ? CRYPTPROTECT_UI_FORBIDDEN | CRYPTPROTECT_LOCAL_MACHINE : CRYPTPROTECT_UI_FORBIDDEN;
}

function scrub(memory: DynComRawMemory) {
  memory.writeBytes(0, Buffer.alloc(Number(memory.size)));
}

/** Overwrites a buffer with zeros, for plain text the caller is done with. */
export function wipe(buffer: Uint8Array) {
  buffer.fill(0);
}

/**
 * The seal and unseal calls over a machine.
 *
 * @param native - The allocator and `LocalFree`.
 * @returns `protect` and `unprotect`, bytes in, bytes out.
 */
export function createDataProtection({ allocate, localFree }: DataProtectionNative) {
  function blobOf({ bytes, held }: {
    readonly bytes: Uint8Array;
    readonly held: DynComRawMemory[];
  }) {
    const payload = allocate({
      size: Math.max(bytes.byteLength, 1),
      alignment: BYTE_ALIGNMENT
    });
    held.push(payload);
    payload.writeBytes(0, Buffer.from(bytes));
    const blob = allocate({
      size: BLOB_BYTES,
      alignment: POINTER_ALIGNMENT
    });
    held.push(blob);
    blob.writeU32(0, bytes.byteLength);
    blob.writeU64(BLOB_POINTER_OFFSET, payload.pointer(0).address);
    return blob;
  }

  function release(held: readonly DynComRawMemory[]) {
    for (const memory of held) {
      scrub(memory);
      memory.release();
    }
  }

  function takeOutput(out: DynComRawMemory) {
    const size = out.readU32(0);
    const address = out.readU64(BLOB_POINTER_OFFSET);
    const isEmpty = size === 0;
    if (isEmpty) {
      return new Uint8Array(0);
    }

    const view = DynComRawMemory.fromUnsafeAddress(address, size, BYTE_ALIGNMENT);
    const result = new Uint8Array(view.readBytes(0, size));
    scrub(view);
    localFree({
      address,
      size
    });
    return result;
  }

  function transform({ operation, data, entropy, scope, description }: SealInput & {
    readonly operation: "CryptProtectData" | "CryptUnprotectData";
  }) {
    requireSize(data);

    const hasEntropy = entropy !== undefined;
    if (hasEntropy) {
      requireSize(entropy);
    }

    const isSeal = operation === "CryptProtectData";
    const held: DynComRawMemory[] = [];
    try {
      const input = blobOf({
        bytes: data,
        held
      });
      const salt = hasEntropy ? blobOf({
        bytes: entropy,
        held
      }) : null;
      const out = allocate({
        size: BLOB_BYTES,
        alignment: POINTER_ALIGNMENT
      });
      held.push(out);
      const hasDescription = isSeal && description !== undefined;
      const text = hasDescription ? wideMemory(description) : null;
      const hasText = text !== null;
      if (hasText) {
        held.push(text);
      }

      const call = bind({
        dll: LIBRARY,
        entryPoint: operation,
        parameters: Array.from({ length: PARAMETER_COUNT }, (_, i) => i === FLAGS_PARAMETER ? "u32" : "pointer"),
        returnType: "i32",
        shouldCaptureLastError: true
      });
      const result = call.invoke([
        pointerOf(input),
        pointerOf(text),
        pointerOf(salt),
        pointerOf(null),
        pointerOf(null),
        DynWin32.u32(flagsOf(scope)),
        pointerOf(out)
      ]);
      const isSuccess = numberOf(result.returnValue) !== 0;
      if (!isSuccess) {
        throw new DataProtectionError({
          operation,
          code: result.lastError ?? 0
        });
      }

      return takeOutput(out);
    } finally {
      release(held);
    }
  }

  return {
    protect: (input: SealInput) => transform({
      ...input,
      operation: "CryptProtectData"
    }),
    unprotect: (input: Input) => transform({
      ...input,
      operation: "CryptUnprotectData"
    })
  };
}
