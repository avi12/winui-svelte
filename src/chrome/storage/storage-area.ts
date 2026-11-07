import {
  AccessLevel,
  parseAccessLevel,
  parseItems,
  parseKeyList,
  parseKeys,
  storedItems
} from "./storage-types.ts";
import type {
  StorageChanges,
  StorageKeyList,
  StorageKeys,
  StorageQuota,
  StoredItems
} from "./storage-types.ts";
import { ChromeEvent } from "#src/downloads/chrome-event.js";
import type { StorageFile } from "#src/web-apis/atomic-file.js";

const READ_ONLY_MESSAGE = "This is a read-only store.";

/** What a `StorageArea` is made from. */
export interface StorageAreaOptions {
  /** Where the area is kept; omitted, the area lives in memory only. */
  readonly file?: StorageFile | undefined;

  /** The area's limits. */
  readonly quota: StorageQuota;

  /** Whether `set`, `remove` and `clear` are refused. */
  readonly isReadOnly?: boolean;

  /** Called with the changes of every operation, after the area's own `onChanged`. */
  readonly onChange?: (changes: StorageChanges) => void;
}

function loadedItems(file: StorageFile | undefined) {
  const text = file?.read();
  const isMissing = text === undefined;
  if (isMissing) {
    return new Map<string, string>();
  }

  try {
    const items = storedItems.parse(JSON.parse(text));
    return new Map(Object.entries(items).map(([key, value]) => [key, JSON.stringify(value)]));
  } catch {
    return new Map<string, string>();
  }
}

function sizeOfEntry({ key, text }: {
  key: string;
  text: string;
}) {
  return key.length + text.length;
}

function valuesOf(items: ReadonlyMap<string, string>) {
  return Object.fromEntries([...items].map(([key, text]) => [key, JSON.parse(text)]));
}

/**
 * One area of `chrome.storage`: the same methods and shapes, with promises
 * where Chrome takes a callback. Values are JSON; one that JSON cannot hold
 * (a function, `undefined`) is left out, and `NaN` becomes `null`, as in
 * Chrome. The area is read from its file on the first call and written back
 * after every change.
 */
export class StorageArea {
  /** Fires with `{ key: { oldValue, newValue } }` after a change made through this area. */
  readonly onChanged = new ChromeEvent<(changes: StorageChanges) => void>();

  /** The most bytes the area holds. */
  readonly QUOTA_BYTES: number;
  /** The most bytes one item holds; only `sync` has it. */
  readonly QUOTA_BYTES_PER_ITEM: number | undefined;
  /** The most items the area holds; only `sync` has it. */
  readonly MAX_ITEMS: number | undefined;
  /** The write limits Chrome sets on `sync`; they are published here and not enforced. */
  readonly MAX_WRITE_OPERATIONS_PER_HOUR: number | undefined;
  /** See `MAX_WRITE_OPERATIONS_PER_HOUR`. */
  readonly MAX_WRITE_OPERATIONS_PER_MINUTE: number | undefined;
  /** See `MAX_WRITE_OPERATIONS_PER_HOUR`. */
  readonly MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE: number | undefined;

  private readonly options: StorageAreaOptions;
  private items: Map<string, string> | undefined;
  private level: AccessLevel = AccessLevel.TRUSTED_CONTEXTS;

  /** Made by `ChromeStorage`. */
  constructor(options: StorageAreaOptions) {
    this.options = options;
    this.QUOTA_BYTES = options.quota.QUOTA_BYTES;
    this.QUOTA_BYTES_PER_ITEM = options.quota.QUOTA_BYTES_PER_ITEM;
    this.MAX_ITEMS = options.quota.MAX_ITEMS;
    this.MAX_WRITE_OPERATIONS_PER_HOUR = options.quota.MAX_WRITE_OPERATIONS_PER_HOUR;
    this.MAX_WRITE_OPERATIONS_PER_MINUTE = options.quota.MAX_WRITE_OPERATIONS_PER_MINUTE;
    this.MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE = options.quota.MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE;
  }

  /**
   * Reads items.
   *
   * @param keys - A key, an array of keys, an object of defaults for absent keys, or null or nothing for everything.
   * @returns The items found, plus the defaults.
   */
  async get(keys?: StorageKeys) {
    const items = this.loaded();
    const request = parseKeys(keys);
    const isEverything = request == null;
    if (isEverything) {
      return valuesOf(items);
    }

    const isDefaults = typeof request === "object" && !Array.isArray(request);
    const defaults: StoredItems = isDefaults ? request : {};
    const names = isDefaults ? Object.keys(request) : parseKeyList(request);
    const result: StoredItems = {};
    for (const name of names) {
      const text = items.get(name);
      const isStored = text !== undefined;
      if (isStored) {
        result[name] = JSON.parse(text);
      } else if (name in defaults) {
        result[name] = defaults[name];
      }
    }

    return result;
  }

  /** The keys the area holds. */
  async getKeys() {
    return [...this.loaded().keys()];
  }

  /**
   * The size of the items, as Chrome counts it: each key's length plus the
   * length of its JSON text.
   *
   * @param keys - The keys to count; every item when omitted or null.
   * @returns The bytes.
   */
  async getBytesInUse(keys?: StorageKeyList | null) {
    const items = this.loaded();
    const names = keys == null ? [...items.keys()] : parseKeyList(keys);
    let total = 0;
    for (const key of names) {
      const text = items.get(key);
      const isStored = text !== undefined;
      if (isStored) {
        total += sizeOfEntry({
          key,
          text
        });
      }
    }

    return total;
  }

  /**
   * Stores items.
   *
   * @param items - The keys and their JSON values.
   * @throws {Error} When the area is read-only, or the write would pass a quota; nothing is stored then.
   */
  async set(items: StoredItems) {
    this.assertWritable();
    const entries = Object.entries(parseItems(items)).flatMap(([key, value]) => {
      const text: string | undefined = JSON.stringify(value);
      return text === undefined ? [] : [[key, text] as const];
    });
    const stored = this.loaded();
    const next = new Map(stored);
    for (const [key, text] of entries) {
      next.set(key, text);
    }

    this.assertWithinQuota({
      next,
      keys: entries.map(([key]) => key)
    });
    const changes: StorageChanges = {};
    for (const [key, text] of entries) {
      const before = stored.get(key);
      const isChanged = before !== text;
      if (isChanged) {
        changes[key] = {
          ...before !== undefined && {
            oldValue: JSON.parse(before)
          },
          newValue: JSON.parse(text)
        };
      }
    }

    this.commit({
      next,
      changes
    });
  }

  /**
   * Removes items.
   *
   * @param keys - A key or an array of keys.
   * @throws {Error} When the area is read-only.
   */
  async remove(keys: StorageKeyList) {
    this.assertWritable();
    const stored = this.loaded();
    const next = new Map(stored);
    const changes: StorageChanges = {};
    for (const key of parseKeyList(keys)) {
      const before = stored.get(key);
      const isStored = before !== undefined;
      if (isStored) {
        next.delete(key);
        changes[key] = { oldValue: JSON.parse(before) };
      }
    }

    this.commit({
      next,
      changes
    });
  }

  /**
   * Removes every item.
   *
   * @throws {Error} When the area is read-only.
   */
  async clear() {
    this.assertWritable();
    const changes: StorageChanges = {};
    for (const [key, text] of this.loaded()) {
      changes[key] = { oldValue: JSON.parse(text) };
    }

    this.commit({
      next: new Map(),
      changes
    });
  }

  /**
   * Chrome's switch between trusted contexts and all of them; every context
   * of a native app is trusted, so the value is kept and changes nothing.
   *
   * @param options - The access level.
   */
  async setAccessLevel(options: { accessLevel: AccessLevel }) {
    this.level = parseAccessLevel(options);
  }

  /** The access level last set. */
  get accessLevel() {
    return this.level;
  }

  private loaded() {
    this.items ??= loadedItems(this.options.file);
    return this.items;
  }

  private assertWritable() {
    const isReadOnly = this.options.isReadOnly === true;
    if (isReadOnly) {
      throw new Error(READ_ONLY_MESSAGE);
    }
  }

  private assertWithinQuota({ next, keys }: {
    next: ReadonlyMap<string, string>;
    keys: readonly string[];
  }) {
    const { QUOTA_BYTES_PER_ITEM: perItem, MAX_ITEMS: maxItems } = this;
    let total = 0;
    for (const [key, text] of next) {
      const size = sizeOfEntry({
        key,
        text
      });
      total += size;
      const isItemTooLarge = perItem !== undefined && keys.includes(key) && size > perItem;
      if (isItemTooLarge) {
        throw new Error("QUOTA_BYTES_PER_ITEM quota exceeded");
      }
    }

    const isTooLarge = total > this.QUOTA_BYTES;
    if (isTooLarge) {
      throw new Error("QUOTA_BYTES quota exceeded");
    }

    const hasTooManyItems = maxItems !== undefined && next.size > maxItems;
    if (hasTooManyItems) {
      throw new Error("MAX_ITEMS quota exceeded");
    }
  }

  private commit({ next, changes }: {
    next: Map<string, string>;
    changes: StorageChanges;
  }) {
    const hasChanges = Object.keys(changes).length > 0;
    if (!hasChanges) {
      return;
    }

    this.options.file?.write(JSON.stringify(valuesOf(next)));
    this.items = next;
    this.onChanged.dispatch(changes);
    this.options.onChange?.(changes);
  }
}
