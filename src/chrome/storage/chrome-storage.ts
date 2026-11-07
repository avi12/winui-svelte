import { StorageArea } from "./storage-area.ts";
import {
  LOCAL_QUOTA,
  MANAGED_QUOTA,
  SESSION_QUOTA,
  StorageAreaName,
  SYNC_QUOTA
} from "./storage-types.ts";
import type { StorageChanges, StorageQuota } from "./storage-types.ts";
import { ChromeEvent } from "#src/downloads/chrome-event.js";
import { appDataFolder, AppDataLocation } from "#src/web-apis/app-data-folder.js";
import type { AppDataEnvironment } from "#src/web-apis/app-data-folder.js";
import { atomicFile } from "#src/web-apis/atomic-file.js";
import type { StorageFile } from "#src/web-apis/atomic-file.js";
import path from "node:path";

const LOCAL_FILE_NAME = "chrome-storage-local.json";
const SYNC_FILE_NAME = "chrome-storage-sync.json";

/** What `ChromeStorage` takes. */
export interface ChromeStorageOptions {
  /** The folder name under the app data folder; the running program's name by default. */
  readonly appName?: string;

  /** Where the data folders are; the tests give their own. */
  readonly environment?: AppDataEnvironment;

  /** Where `local` is kept; a JSON file in the app's local data folder by default. */
  readonly localFile?: StorageFile;

  /** Where `sync` is kept; a second JSON file next to `local` by default. */
  readonly syncFile?: StorageFile;
}

function defaultFile({ options, name }: {
  options: ChromeStorageOptions;
  name: string;
}) {
  return atomicFile(
    path.join(
      appDataFolder({
        location: AppDataLocation.LOCAL,
        ...options.appName !== undefined && {
          appName: options.appName
        },
        ...options.environment !== undefined && {
          environment: options.environment
        }
      }), name
    )
  );
}

/**
 * `chrome.storage` for a Windows app. `local` is a JSON file in the app's
 * local data folder (the same folder `localStorage` uses), `session` lives in
 * memory for the life of the process, `managed` is read-only and empty, and
 * `sync` is a second local file: Windows has no sync service an unpackaged app
 * can use (roaming settings are deprecated), so values do not reach other PCs,
 * but the quotas of Chrome's `sync` apply so code meets the same errors. A
 * change made in another process is not seen. Nothing is read or made until
 * the first call on an area.
 */
export class ChromeStorage {
  /** Fires with the changes and the area's name after a change in any area. */
  readonly onChanged = new ChromeEvent<(changes: StorageChanges, areaName: StorageAreaName) => void>();
  /** Persistent items, kept in a file; 10 MiB. */
  readonly local: StorageArea;
  /** Items Chrome would sync; here a second local file, 100 KiB. */
  readonly sync: StorageArea;
  /** In-memory items, gone when the process ends; 10 MiB. */
  readonly session: StorageArea;
  /** Read-only items set by policy; always empty. */
  readonly managed: StorageArea;

  /** Made once per app. */
  constructor(options: ChromeStorageOptions = {}) {
    this.local = this.areaOf({
      name: StorageAreaName.LOCAL,
      file: options.localFile ?? defaultFile({
        options,
        name: LOCAL_FILE_NAME
      }),
      quota: LOCAL_QUOTA
    });
    this.sync = this.areaOf({
      name: StorageAreaName.SYNC,
      file: options.syncFile ?? defaultFile({
        options,
        name: SYNC_FILE_NAME
      }),
      quota: SYNC_QUOTA
    });
    this.session = this.areaOf({
      name: StorageAreaName.SESSION,
      file: undefined,
      quota: SESSION_QUOTA
    });
    this.managed = this.areaOf({
      name: StorageAreaName.MANAGED,
      file: undefined,
      quota: MANAGED_QUOTA,
      isReadOnly: true
    });
  }

  private areaOf({ name, file, quota, isReadOnly = false }: {
    name: StorageAreaName;
    file: StorageFile | undefined;
    quota: StorageQuota;
    isReadOnly?: boolean;
  }) {
    return new StorageArea({
      file,
      quota,
      isReadOnly,
      onChange: changes => this.onChanged.dispatch(changes, name)
    });
  }
}
