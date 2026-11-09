/**
 * Whose key seals the data, the same two values as .NET's
 * `DataProtectionScope`.
 */
export const ProtectionScope = {
  /** Only this Windows user on this machine (the default). */
  CURRENT_USER: "current-user",
  /** Any user of this machine (`CRYPTPROTECT_LOCAL_MACHINE`). */
  LOCAL_MACHINE: "local-machine"
} as const;

/** One of the `ProtectionScope` values. */
export type ProtectionScope = typeof ProtectionScope[keyof typeof ProtectionScope];
