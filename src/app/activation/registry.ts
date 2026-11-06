/** Where a value is: a key below `HKEY_CURRENT_USER` and a value name (empty for the key's default value). */
export interface ValueAddress {
  readonly key: string;
  readonly name: string;
}

/** The registry operations the registrations need; a test gives a fake. */
export interface RegistryBackend {
  /** Writes a string value, creating the key and its parents. */
  setString(options: ValueAddress & { value: string }): void;

  /** Reads a string value; `undefined` when the key or the value is missing. */
  readString(address: ValueAddress): string | undefined;

  /** Whether the key exists. */
  hasKey(key: string): boolean;

  /** Deletes the key and everything under it; nothing happens when it is missing. */
  deleteTree(key: string): void;

  /** Deletes one value; nothing happens when it is missing. */
  deleteValue(address: ValueAddress): void;

  /** Deletes the key only when it has no values and no subkeys; returns whether it was deleted. */
  deleteKeyIfEmpty(key: string): boolean;
}
