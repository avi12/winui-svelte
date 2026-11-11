import type { AppDataEnvironment, AppDataLocation } from "./app-data-folder.ts";
import { appDataFile } from "./atomic-file.ts";
import type { StorageFile } from "./atomic-file.ts";
import { DomErrorName } from "./dom-exception.ts";
import { defineProperty } from "./install.ts";
import { startTimer } from "#src/window/timers.js";
import { z } from "zod";

const FILE_NAME = "local-storage.json";
const DEBOUNCE_MILLISECONDS = 200;
const MAXIMUM_WAIT_MILLISECONDS = 2000;
const BYTES_PER_MEBIBYTE = 1_048_576;
const QUOTA_MEBIBYTES = 5;
const QUOTA_CHARACTERS = QUOTA_MEBIBYTES * BYTES_PER_MEBIBYTE;
const STORAGE_EVENT = "storage";

const storedItems = z.record(z.string(), z.string());

/** Runs a callback after a delay, and gives back the way to cancel it. */
export type Schedule = (options: {
  milliseconds: number;
  onTick: () => void;
}) => () => void;

/**
 * Runs on the window thread's dispatcher, where Node's own timers never
 * fire, and on Node's timers elsewhere.
 *
 * @param options - The delay and the callback.
 * @returns What cancels it.
 */
export function defaultSchedule({ milliseconds, onTick }: {
  milliseconds: number;
  onTick: () => void;
}) {
  try {
    const stop = startTimer({
      milliseconds,
      isRepeating: false,
      onTick() {
        stop();
        onTick();
      }
    });
    return stop;
  } catch {
    const timer = setTimeout(onTick, milliseconds);
    timer.unref();
    return () => clearTimeout(timer);
  }
}

/** The `storage` event: what changed, in which storage. */
export class StorageEvent extends Event {
  readonly key: string | null;
  readonly oldValue: string | null;
  readonly newValue: string | null;
  readonly url: string;
  readonly storageArea: Storage | null;

  /** Made when a storage changes and `shouldNotifySelf` is on. */
  constructor(type: string, init: {
    key?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
    url?: string;
    storageArea?: Storage | null;
  } = {}) {
    super(type);
    this.key = init.key ?? null;
    this.oldValue = init.oldValue ?? null;
    this.newValue = init.newValue ?? null;
    this.url = init.url ?? "";
    this.storageArea = init.storageArea ?? null;
  }
}

/** What a `Storage` reports and asks for. */
interface StorageHooks {
  readonly onChange: (change: {
    key: string | null;
    oldValue: string | null;
    newValue: string | null;
  }) => void;
  readonly quotaCharacters: number;
}

function sizeOf(items: ReadonlyMap<string, string>) {
  let total = 0;
  for (const [key, value] of items) {
    total += key.length + value.length;
  }

  return total;
}

const targets = new WeakMap<object, {
  items: Map<string, string>;
  hooks: StorageHooks;
}>();

function stateOf(storage: object) {
  const state = targets.get(storage);
  const isUnknown = state === undefined;
  if (isUnknown) {
    throw new TypeError("Illegal invocation");
  }

  return state;
}

/**
 * `localStorage` and `sessionStorage`: string keys and values, read
 * synchronously from memory. Properties work like `getItem` and `setItem`
 * (`storage.theme = "dark"`).
 */
export class Storage {
  /** Made by `installWebStorage`. */
  constructor(options: {
    items: Map<string, string>;
    hooks: StorageHooks;
  }) {
    const proxy = new Proxy(this, propertyHandler);
    targets.set(this, options);
    targets.set(proxy, options);

    return proxy;
  }

  /** The number of stored keys. */
  get length() {
    return stateOf(this).items.size;
  }

  /** The key at an index, or null past the end. */
  key(index: number) {
    return [...stateOf(this).items.keys()][index] ?? null;
  }

  /** The value stored under a key, or null. */
  getItem(key: string) {
    return stateOf(this).items.get(String(key)) ?? null;
  }

  /**
   * Stores a value.
   *
   * @throws {DOMException} `QuotaExceededError` when the storage would pass 5 MiB characters.
   */
  setItem(key: string, value: string) {
    const { items, hooks } = stateOf(this);
    const name = String(key);
    const text = String(value);
    const oldValue = items.get(name) ?? null;
    const isUnchanged = oldValue === text;
    if (isUnchanged) {
      return;
    }

    const growth = name.length + text.length - (oldValue === null ? 0 : name.length + oldValue.length);
    const isOverQuota = sizeOf(items) + growth > hooks.quotaCharacters;
    if (isOverQuota) {
      throw new DOMException(`Failed to execute 'setItem' on 'Storage': Setting the value of '${name}' exceeded the quota.`, DomErrorName.QUOTA_EXCEEDED);
    }

    items.set(name, text);
    hooks.onChange({
      key: name,
      oldValue,
      newValue: text
    });
  }

  /** Removes a key. */
  removeItem(key: string) {
    const { items, hooks } = stateOf(this);
    const name = String(key);
    const oldValue = items.get(name);
    const isAbsent = oldValue === undefined;
    if (isAbsent) {
      return;
    }

    items.delete(name);
    hooks.onChange({
      key: name,
      oldValue,
      newValue: null
    });
  }

  /** Removes every key. */
  clear() {
    const { items, hooks } = stateOf(this);
    const isEmpty = items.size === 0;
    if (isEmpty) {
      return;
    }

    items.clear();
    hooks.onChange({
      key: null,
      oldValue: null,
      newValue: null
    });
  }

  get [Symbol.toStringTag]() {
    return "Storage";
  }
}

function isNamed({ storage, property }: {
  storage: Storage;
  property: string | symbol;
}) {
  return typeof property === "string" && !(property in Storage.prototype) && stateOf(storage).items.has(property);
}

const propertyHandler: ProxyHandler<Storage> = {
  get(target, property, receiver) {
    const isStored = isNamed({
      storage: target,
      property
    });
    // eslint-disable-next-line no-restricted-syntax -- the one typed way to forward a property read
    return isStored ? target.getItem(String(property)) : Reflect.get(target, property, receiver);
  },
  set(target, property, value) {
    const isName = typeof property === "string";
    if (!isName) {
      return false;
    }

    target.setItem(property, value);
    return true;
  },
  has(target, property) {
    return isNamed({
      storage: target,
      property
    }) || property in target;
  },
  deleteProperty(target, property) {
    const isName = typeof property === "string";
    if (isName) {
      target.removeItem(property);
    }

    return true;
  },
  ownKeys(target) {
    return [...stateOf(target).items.keys()];
  },
  getOwnPropertyDescriptor(target, property) {
    const isStored = isNamed({
      storage: target,
      property
    });
    if (!isStored) {
      return undefined;
    }

    return {
      value: target.getItem(String(property)),
      writable: true,
      enumerable: true,
      configurable: true
    };
  }
};

/** What `installWebStorage` takes. */
export interface WebStorageInstallOptions {
  /** The folder name under the app data folder; the running program's name by default. */
  readonly appName?: string;

  /** `local` (default) or `roaming`, which follows the user to other PCs. */
  readonly location?: AppDataLocation;

  /** Where the data folders are; the tests give their own. */
  readonly environment?: AppDataEnvironment;

  /** Where `localStorage` is kept; a file in the app data folder by default. */
  readonly file?: StorageFile;

  /** Runs the delayed writes; the tests give a manual one. */
  readonly schedule?: Schedule;

  /** How long after the last change the file is written. Default 200. */
  readonly debounceMilliseconds?: number;

  /** The longest a change waits before it is written, however many follow. Default 2000. */
  readonly maximumWaitMilliseconds?: number;

  /** The most characters (keys and values) a storage holds. Default 5 MiB. */
  readonly quotaCharacters?: number;

  /**
   * Also fire `storage` on `eventTarget` for changes made here. A browser
   * fires it only in the other windows, so the default is false; it helps
   * an app with several windows that share this one script context.
   */
  readonly shouldNotifySelf?: boolean;

  /** Where `storage` events go when `shouldNotifySelf` is on; the global scope by default. */
  readonly eventTarget?: EventTarget;
}

function loadedItems(file: StorageFile) {
  const text = file.read();
  const isMissing = text === undefined;
  if (isMissing) {
    return new Map<string, string>();
  }

  try {
    return new Map(Object.entries(storedItems.parse(JSON.parse(text))));
  } catch {
    return new Map<string, string>();
  }
}

/** Writes after the changes stop for a while, but never later than a maximum wait. */
class DebouncedWriter {
  private readonly options: {
    write: () => void;
    schedule: Schedule;
    debounceMilliseconds: number;
    maximumWaitMilliseconds: number;
  };
  private cancelDebounce: (() => void) | undefined;
  private cancelMaximumWait: (() => void) | undefined;

  constructor(options: DebouncedWriter["options"]) {
    this.options = options;
  }

  markChanged() {
    const { schedule, debounceMilliseconds, maximumWaitMilliseconds } = this.options;
    this.cancelDebounce?.();
    this.cancelDebounce = schedule({
      milliseconds: debounceMilliseconds,
      onTick: () => this.flush()
    });
    const isWaiting = this.cancelMaximumWait !== undefined;
    if (!isWaiting) {
      this.cancelMaximumWait = schedule({
        milliseconds: maximumWaitMilliseconds,
        onTick: () => this.flush()
      });
    }
  }

  flushIfPending() {
    const isPending = this.cancelDebounce !== undefined;
    if (isPending) {
      this.flush();
    }
  }

  private flush() {
    this.cancelDebounce?.();
    this.cancelMaximumWait?.();
    this.cancelDebounce = undefined;
    this.cancelMaximumWait = undefined;
    this.options.write();
  }
}

function notifyStorageEvent({ options, change, storage }: {
  options: WebStorageInstallOptions;
  change: {
    key: string | null;
    oldValue: string | null;
    newValue: string | null;
  };
  storage: Storage;
}) {
  const target = options.eventTarget ?? globalThis;
  const isNotifying = options.shouldNotifySelf === true && "dispatchEvent" in target;
  if (isNotifying) {
    target.dispatchEvent(
      new StorageEvent(STORAGE_EVENT, {
        ...change,
        storageArea: storage
      })
    );
  }
}

/**
 * Defines `localStorage`, `sessionStorage`, `Storage` and `StorageEvent`.
 * `localStorage` is read from its file once, then answered from memory, so
 * every call is synchronous; changes are written back after a short delay,
 * all at once, to a sibling file that replaces the old one in one step, and
 * once more when the program exits or the API is uninstalled. `sessionStorage`
 * lasts as long as the process.
 *
 * @param options - The app's name, the file, and the timing.
 * @returns The function that writes pending changes and takes them away again.
 */
export function installWebStorage(options: WebStorageInstallOptions = {}) {
  const file = appDataFile({
    fileName: FILE_NAME,
    options
  });
  const localItems = loadedItems(file);
  const writer = new DebouncedWriter({
    write: () => file.write(JSON.stringify(Object.fromEntries(localItems))),
    schedule: options.schedule ?? defaultSchedule,
    debounceMilliseconds: options.debounceMilliseconds ?? DEBOUNCE_MILLISECONDS,
    maximumWaitMilliseconds: options.maximumWaitMilliseconds ?? MAXIMUM_WAIT_MILLISECONDS
  });
  const quotaCharacters = options.quotaCharacters ?? QUOTA_CHARACTERS;
  const local: Storage = new Storage({
    items: localItems,
    hooks: {
      quotaCharacters,
      onChange(change) {
        writer.markChanged();
        notifyStorageEvent({
          options,
          change,
          storage: local
        });
      }
    }
  });
  const session: Storage = new Storage({
    items: new Map(),
    hooks: {
      quotaCharacters,
      onChange(change) {
        notifyStorageEvent({
          options,
          change,
          storage: session
        });
      }
    }
  });
  function flushOnExit() {
    writer.flushIfPending();
  }

  process.on("exit", flushOnExit);

  const uninstalls = [
    defineProperty({
      name: "localStorage",
      value: local
    }),
    defineProperty({
      name: "sessionStorage",
      value: session
    }),
    defineProperty({
      name: "Storage",
      value: Storage
    }),
    defineProperty({
      name: "StorageEvent",
      value: StorageEvent
    })
  ];
  return () => {
    flushOnExit();
    process.off("exit", flushOnExit);
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }
  };
}
