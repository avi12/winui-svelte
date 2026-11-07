import { z } from "zod";

/** The four storage areas, named as `chrome.storage` names them. */
export const StorageAreaName = {
  LOCAL: "local",
  SYNC: "sync",
  SESSION: "session",
  MANAGED: "managed"
} as const;
/** One of the values of `StorageAreaName`. */
export type StorageAreaName = (typeof StorageAreaName)[keyof typeof StorageAreaName];

/** Who may read an area: Chrome's `AccessLevel`. */
export const AccessLevel = {
  TRUSTED_CONTEXTS: "TRUSTED_CONTEXTS",
  TRUSTED_AND_UNTRUSTED_CONTEXTS: "TRUSTED_AND_UNTRUSTED_CONTEXTS"
} as const;
/** One of the values of `AccessLevel`. */
export type AccessLevel = (typeof AccessLevel)[keyof typeof AccessLevel];

/** The numbers of an area's quota, as Chrome publishes them. */
export interface StorageQuota {
  readonly QUOTA_BYTES: number;
  readonly QUOTA_BYTES_PER_ITEM?: number;
  readonly MAX_ITEMS?: number;
  readonly MAX_WRITE_OPERATIONS_PER_HOUR?: number;
  readonly MAX_WRITE_OPERATIONS_PER_MINUTE?: number;
  readonly MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE?: number;
}

/** `chrome.storage.local.QUOTA_BYTES`. */
export const LOCAL_QUOTA = { QUOTA_BYTES: 10_485_760 } as const satisfies StorageQuota;

/** `chrome.storage.session.QUOTA_BYTES`. */
export const SESSION_QUOTA = { QUOTA_BYTES: 10_485_760 } as const satisfies StorageQuota;

/** The limits of `chrome.storage.sync`; the fallback keeps them so code written for Chrome meets the same errors. */
export const SYNC_QUOTA = {
  QUOTA_BYTES: 102_400,
  QUOTA_BYTES_PER_ITEM: 8192,
  MAX_ITEMS: 512,
  MAX_WRITE_OPERATIONS_PER_HOUR: 1800,
  MAX_WRITE_OPERATIONS_PER_MINUTE: 120,
  MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE: 1_000_000
} as const satisfies StorageQuota;

/** `chrome.storage.managed`: no policy, so no room and no items. */
export const MANAGED_QUOTA = { QUOTA_BYTES: 0 } as const satisfies StorageQuota;

/** What an area stores: JSON values by string key. */
export type StoredItems = Record<string, unknown>;

/** One key's change, as `onChanged` reports it. */
export interface StorageChange {
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
}

/** Every changed key of one operation. */
export type StorageChanges = Record<string, StorageChange>;

/** The `keys` argument of `get`: a key, keys, defaults, or null for everything. */
export type StorageKeys = string | readonly string[] | StoredItems | null | undefined;

/** The `keys` argument of `remove` and `getBytesInUse`. */
export type StorageKeyList = string | readonly string[];

/** The shape of a stored file: JSON values by key. */
export const storedItems = z.record(z.string(), z.json());

const keyList = z.union([z.string(), z.array(z.string())]);
const keysArgument = z.union([keyList, z.record(z.string(), z.unknown()), z.null(), z.undefined()]);
const itemsArgument = z.record(z.string(), z.unknown());
const accessLevelArgument = z.object({ accessLevel: z.enum(AccessLevel) });

/**
 * Checks the `keys` argument of `get`.
 *
 * @param keys - The argument as the caller gave it.
 * @returns The same value, typed.
 */
export function parseKeys(keys: unknown) {
  return keysArgument.parse(keys);
}

/**
 * Checks a list of keys.
 *
 * @param keys - A key or keys as the caller gave them.
 * @returns The keys as an array.
 */
export function parseKeyList(keys: unknown) {
  const parsed = keyList.parse(keys);
  return typeof parsed === "string" ? [parsed] : parsed;
}

/**
 * Checks the items `set` is given.
 *
 * @param items - The argument as the caller gave it.
 * @returns The same object, typed.
 */
export function parseItems(items: unknown) {
  return itemsArgument.parse(items);
}

/**
 * Checks the argument of `setAccessLevel`.
 *
 * @param options - The argument as the caller gave it.
 * @returns The access level.
 */
export function parseAccessLevel(options: unknown) {
  return accessLevelArgument.parse(options).accessLevel;
}
