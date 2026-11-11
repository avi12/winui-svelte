import { parsePermissions, parseRequest, parseStored } from "./permission-schema.ts";
import {
  ALL_URLS,
  FALLBACK_SETTINGS_PAGE,
  GRANTED_BY_DEFAULT,
  NATIVE_PERMISSIONS,
  SETTINGS_PAGE
} from "./permission-table.ts";
import type { Permissions } from "./permission-types.ts";
import { launchUri } from "#src/data-transfer/launcher.js";
import { ChromeEvent } from "#src/downloads/chrome-event.js";
import type { AppDataEnvironment, AppDataLocation } from "#src/web-apis/app-data-folder.js";
import type { StorageFile } from "#src/web-apis/atomic-file.js";
import { appDataFile } from "#src/web-apis/atomic-file.js";
import { PermissionStateName, readPermission, requestPermission } from "#src/web-apis/permissions.js";
import type { PermissionName } from "#src/web-apis/permissions.js";

const FILE_NAME = "chrome-permissions.json";

/** What `ChromePermissions` takes; the tests give stand-ins. */
export interface ChromePermissionsOptions {
  /** Where the granted names are kept; `chrome-permissions.json` in the app's data folder by default. */
  readonly file?: StorageFile;

  /** The app's folder name under the data folder; the program's name by default. */
  readonly appName?: string;

  /** Which data folder; local by default. */
  readonly location?: AppDataLocation;

  /** Where the data folders are (tests). */
  readonly environment?: AppDataEnvironment;

  /** Opens a Settings page; `launchUri` by default. */
  readonly openSettings?: (url: string) => unknown;
}

function isNativeName(name: string) {
  return NATIVE_PERMISSIONS.has(name);
}

function assertKnown(name: string) {
  const isKnown = isNativeName(name) || GRANTED_BY_DEFAULT.has(name);
  if (!isKnown) {
    throw new Error(`'${name}' is not a valid permission`);
  }
}

function webNamesOf(name: string) {
  return NATIVE_PERMISSIONS.get(name) ?? [];
}

/**
 * `chrome.permissions` for a native app. A permission here is the OS consent
 * the Permissions API already reports (camera, microphone, location,
 * notifications and so on): the app holds one once it asked and Windows
 * allows it, and loses it when either side takes it back. Names with no
 * native meaning (`tabs`, `storage`, `webRequest` and so on) are always held,
 * and every origin is held, since a native app has no host permissions.
 */
export class ChromePermissions {
  /** Fires when `request` gives the app permissions it did not hold. */
  readonly onAdded = new ChromeEvent<(permissions: Permissions) => void>();

  /** Fires when `remove` takes permissions away. */
  readonly onRemoved = new ChromeEvent<(permissions: Permissions) => void>();

  private readonly file: StorageFile;
  private readonly openSettings: (url: string) => unknown;
  private readonly granted: Set<string>;

  /** Reads the saved grants; the API's own folder is made on the first write. */
  constructor(options: ChromePermissionsOptions = {}) {
    this.file = appDataFile({
      fileName: FILE_NAME,
      options
    });
    this.openSettings = options.openSettings ?? launchUri;
    this.granted = new Set(parseStored(this.file.read()));
  }

  /**
   * Lists what the app holds.
   *
   * @returns The held permission names, and `<all_urls>` as the origins.
   */
  async getAll() {
    return {
      permissions: [...GRANTED_BY_DEFAULT, ...NATIVE_PERMISSIONS.keys().filter(name => this.isHeld(name))],
      origins: [ALL_URLS]
    } satisfies Permissions;
  }

  /**
   * Whether the app holds every permission and origin.
   *
   * @param permissions - An object with `permissions` and `origins`.
   * @returns True when all are held.
   * @throws {Error} For an unknown permission name or a bad match pattern.
   */
  async contains(permissions: Permissions) {
    const { permissions: names } = parsePermissions(permissions);
    for (const name of names) {
      assertKnown(name);
    }

    return names.every(name => this.isHeld(name));
  }

  /**
   * Asks for permissions. Each native one is checked against Windows; one it
   * has not decided yet shows the system prompt where WinRT has one. All must
   * be allowed for the answer to be true, and then they are saved and
   * `onAdded` fires with the ones that were new.
   *
   * @param permissions - An object with `permissions` and `origins`, and the WinUI-only `openSettings`:
   *   when a permission stays refused, open the Settings page that has its switch (the answer is still false).
   * @returns True when the app holds all of them afterwards.
   * @throws {Error} For an unknown permission name or a bad match pattern.
   */
  async request(permissions: Permissions & { readonly openSettings?: boolean }) {
    const { permissions: names, isOpeningSettings } = parseRequest(permissions);
    for (const name of names) {
      assertKnown(name);
    }

    const missing = names.filter(name => !this.isHeld(name));
    const answers = await Promise.all(
      missing.map(name => this.ask({
        name,
        isOpeningSettings
      }))
    );
    const isAllowed = answers.every(Boolean);
    if (!isAllowed) {
      return false;
    }

    const added = missing;
    this.save({
      added,
      removed: []
    });
    const hasAdded = added.length > 0;
    if (hasAdded) {
      this.onAdded.dispatch({
        permissions: added,
        origins: []
      });
    }

    return true;
  }

  /**
   * Gives permissions back; the app asks again to hold them. Always-held
   * names and origins cannot be removed.
   *
   * @param permissions - An object with `permissions` and `origins`.
   * @returns False when any is one that cannot be removed; true otherwise.
   * @throws {Error} For an unknown permission name or a bad match pattern.
   */
  async remove(permissions: Permissions) {
    const { permissions: names, origins } = parsePermissions(permissions);
    for (const name of names) {
      assertKnown(name);
    }

    const isRequired = origins.length > 0 || names.some(name => !isNativeName(name));
    if (isRequired) {
      return false;
    }

    const removed = names.filter(name => this.granted.has(name));
    this.save({
      added: [],
      removed
    });
    const hasRemoved = removed.length > 0;
    if (hasRemoved) {
      this.onRemoved.dispatch({
        permissions: removed,
        origins: []
      });
    }

    return true;
  }

  private isHeld(name: string) {
    const isRequired = GRANTED_BY_DEFAULT.has(name);
    if (isRequired) {
      return true;
    }

    const isSaved = this.granted.has(name);
    const isAllowed = webNamesOf(name).every(web => readPermission(web) === PermissionStateName.GRANTED);
    return isSaved && isAllowed;
  }

  private async ask({ name, isOpeningSettings }: {
    name: string;
    isOpeningSettings: boolean;
  }) {
    const webNames = webNamesOf(name);
    const states = await Promise.all(webNames.map(web => this.stateAfterAsking(web)));
    const isAllowed = states.every(state => state === PermissionStateName.GRANTED);
    const shouldOpenSettings = !isAllowed && isOpeningSettings;
    if (shouldOpenSettings) {
      const refused = webNames.find((_, i) => states[i] !== PermissionStateName.GRANTED);
      const page = refused === undefined ? undefined : SETTINGS_PAGE.get(refused);
      await this.openSettings(page ?? FALLBACK_SETTINGS_PAGE);
    }

    return isAllowed;
  }

  private async stateAfterAsking(web: PermissionName) {
    const state = readPermission(web);
    const isUndecided = state === PermissionStateName.PROMPT;
    if (isUndecided) {
      return requestPermission(web);
    }

    return state;
  }

  private save({ added, removed }: {
    added: readonly string[];
    removed: readonly string[];
  }) {
    const hasChange = added.length > 0 || removed.length > 0;
    if (!hasChange) {
      return;
    }

    for (const name of added) {
      this.granted.add(name);
    }

    for (const name of removed) {
      this.granted.delete(name);
    }

    this.file.write(JSON.stringify({ granted: [...this.granted] }));
  }
}
