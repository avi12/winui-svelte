import { createDataProtection, REAL_NATIVE } from "./native.ts";
import type { ProtectionScope } from "./protection-scope.ts";

export { DataProtectionError } from "./data-protection-error.ts";
export { MAX_DATA_BYTES, wipe } from "./native.ts";
export { ProtectionScope } from "./protection-scope.ts";

/** What `protectData` takes. */
export interface ProtectOptions {
  /** The bytes to seal; the library keeps no copy, and wiping yours is up to you (`wipe`). */
  readonly data: Uint8Array;
  /** Mixed into the key; the same bytes are needed to unseal. */
  readonly entropy?: Uint8Array;
  /** `ProtectionScope.CURRENT_USER` by default, as .NET's `DataProtectionScope`. */
  readonly scope?: ProtectionScope;
  /** A label stored in the blob and shown by tools. */
  readonly description?: string;
}

/** What `unprotectData` takes. */
export interface UnprotectOptions {
  /** The blob DPAPI or .NET's `ProtectedData.Protect` made. */
  readonly data: Uint8Array;
  /** The entropy the blob was sealed with. */
  readonly entropy?: Uint8Array;
  /** The scope the blob was sealed with; Windows reads it from the blob, so this is only a hint. */
  readonly scope?: ProtectionScope;
}

/**
 * Seals bytes with DPAPI for the current Windows user (or the machine); the
 * result is the blob .NET's `ProtectedData.Protect` makes, so each can read the
 * other's. Windows keeps no copy and offers no recovery: a password reset by an
 * administrator can make a blob unreadable. Native buffers that held the data
 * are zeroed; a JavaScript string cannot be, so keep secrets as bytes.
 *
 * @param options - The data and, optionally, entropy, scope and a description.
 * @returns The sealed blob.
 * @throws DataProtectionError - When Windows refuses (carries the Win32 code).
 * @throws RangeError - When the data or the entropy is over `MAX_DATA_BYTES`.
 */
export function protectData(options: ProtectOptions) {
  return createDataProtection(REAL_NATIVE).protect(options);
}

/**
 * Unseals a DPAPI blob made by DPAPI or .NET's `ProtectedData.Protect`. The
 * returned bytes are the caller's to `wipe`.
 *
 * @param options - The blob and, when it was sealed with one, its entropy.
 * @returns The plain bytes.
 * @throws DataProtectionError - When the blob is corrupt, the entropy is wrong or another user sealed it.
 * @throws RangeError - When the data or the entropy is over `MAX_DATA_BYTES`.
 */
export function unprotectData(options: UnprotectOptions) {
  return createDataProtection(REAL_NATIVE).unprotect(options);
}
