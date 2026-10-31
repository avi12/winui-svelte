import type { AppDataEnvironment } from "./app-data-folder.ts";
import { appDataFolder, AppDataLocation } from "./app-data-folder.ts";
import type { FileSystemDirectoryHandle } from "./file-system.ts";
import { directoryHandleAt } from "./file-system.ts";
import { defineNavigatorProperty } from "./install.ts";
import { PermissionStateName, registerPermission } from "./permissions.ts";
import { mkdirSync, readdirSync, statfsSync, statSync } from "node:fs";
import path from "node:path";

const PERMISSION_NAME = "persistent-storage";
const ORIGIN_FOLDER = "origin-private-file-system";

/** What `navigator.storage.estimate()` resolves to. */
export interface StorageEstimate {
  /** Bytes the origin private file system holds. */
  readonly usage: number;

  /** Bytes it could hold: what it uses plus the free space on its drive. */
  readonly quota: number;
}

/**
 * What Windows adds to `navigator.storage`; a browser has none of it. They
 * autocomplete only where this module is imported.
 */
export interface StorageManagerExtras {
  /**
   * The origin private file system, or another of the app's folders:
   * `roaming` follows the user to other PCs, `temporary` may be cleaned up.
   */
  getDirectory(options?: {
    readonly location?: AppDataLocation;
  }): Promise<FileSystemDirectoryHandle>;
}

declare global {
  // The extras join the standard StorageManager wherever this module is imported.
  interface StorageManager {
    getDirectory(options?: Parameters<StorageManagerExtras["getDirectory"]>[0]): ReturnType<StorageManagerExtras["getDirectory"]>;
  }
}

function sizeOfFolder(root: string) {
  let total = 0;
  const pending = [root];
  for (const folder of pending) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const location = path.join(folder, entry.name);
      const isFolder = entry.isDirectory();
      if (isFolder) {
        pending.push(location);
      } else {
        total += statSync(location).size;
      }
    }
  }

  return total;
}

/** The `navigator.storage` object. */
export class StorageManager implements StorageManagerExtras {
  private readonly folderOf: (location: AppDataLocation) => string;

  /** Made by `installStorage`. */
  constructor(folderOf: (location: AppDataLocation) => string) {
    this.folderOf = folderOf;
  }

  /** How much the origin private file system holds, and how much it could. */
  estimate() {
    const folder = this.originFolder(AppDataLocation.LOCAL);
    const usage = sizeOfFolder(folder);
    const { bavail, bsize } = statfsSync(folder);
    return Promise.resolve({
      usage,
      quota: usage + Number(bavail) * Number(bsize)
    } satisfies StorageEstimate);
  }

  /** Always true: the data lives in the user's profile and Windows does not evict it. */
  persist() {
    return Promise.resolve(true);
  }

  /** Always true. */
  persisted() {
    return Promise.resolve(true);
  }

  /** The root of the origin private file system, a folder of the app's own. */
  getDirectory(options: { readonly location?: AppDataLocation } = {}) {
    return Promise.resolve(directoryHandleAt(this.originFolder(options.location ?? AppDataLocation.LOCAL)));
  }

  get [Symbol.toStringTag]() {
    return "StorageManager";
  }

  private originFolder(location: AppDataLocation) {
    const folder = path.join(this.folderOf(location), ORIGIN_FOLDER);
    mkdirSync(folder, { recursive: true });
    return folder;
  }
}

/** What `installStorage` takes. */
export interface StorageInstallOptions {
  /** The folder name under `%LOCALAPPDATA%`; the running program's name by default. */
  readonly appName?: string;

  /** Where the data folders are; the tests give their own. */
  readonly environment?: AppDataEnvironment;
}

/**
 * Defines `navigator.storage`: `estimate`, `persist`, `persisted` and
 * `getDirectory`, the origin private file system. It is a folder named for
 * the app under `%LOCALAPPDATA%`, with the same handles as the File System
 * Access API (install that module's classes with `installFileSystem` to have
 * them as globals). It also registers the `persistent-storage` permission,
 * always granted.
 *
 * @param options - The app's name, and the folders' places for tests.
 * @returns The function that takes them away again.
 */
export function installStorage(options: StorageInstallOptions = {}) {
  const manager = new StorageManager(location => appDataFolder({
    location,
    ...options.appName !== undefined && {
      appName: options.appName
    },
    ...options.environment !== undefined && {
      environment: options.environment
    }
  }));
  const uninstalls = [
    defineNavigatorProperty({
      name: "storage",
      value: manager
    }),
    registerPermission({
      name: PERMISSION_NAME,
      provider: {
        state: () => PermissionStateName.GRANTED
      }
    })
  ];
  return () => {
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }
  };
}
