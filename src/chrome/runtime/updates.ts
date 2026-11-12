import { ChromeEvent } from "#src/downloads/chrome-event.js";
import { PackageUpdateState } from "#src/store/states.js";
import type { StoreBackend, UpdateCheck } from "#src/store/types.js";
import { Updater } from "#src/updater/updater.js";
import type { UpdaterOptions } from "#src/updater/updater.js";

const DEFAULT_THROTTLE_MILLISECONDS = 300_000;

/** The `status` of `chrome.runtime.requestUpdateCheck`. */
export const UpdateCheckStatus = {
  THROTTLED: "throttled",
  NO_UPDATE: "no_update",
  UPDATE_AVAILABLE: "update_available"
} as const;

/** One of `UpdateCheckStatus`. */
export type UpdateCheckStatus = typeof UpdateCheckStatus[keyof typeof UpdateCheckStatus];

/** What `requestUpdateCheck` resolves with, and what `onUpdateAvailable` is called with (`version` only). */
export interface UpdateCheckResult {
  readonly status: UpdateCheckStatus;
  readonly version?: string;
}

interface ThrottledSource {
  /** Calls closer together than this answer `throttled`, as Chrome does; five minutes by default. */
  readonly minimumIntervalMilliseconds?: number;
}

/** Where a Squirrel-style install gets its updates; the running version comes from the manifest. */
export interface FeedUpdateSource extends Omit<UpdaterOptions, "currentVersion">, ThrottledSource {
  readonly appInstallerUrl?: never;
}

/** Where a package installed outside the Store gets its updates. */
export interface AppInstallerUpdateSource extends ThrottledSource {
  /** The address of the `.appinstaller` file the package was installed from; Windows installs from it. */
  readonly appInstallerUrl: string;
}

/** Where updates come from: a feed (a per-user install) or an `.appinstaller` file (a sideloaded package). */
export type RuntimeUpdateSource = FeedUpdateSource | AppInstallerUpdateSource;

const APP_INSTALLER_SCHEME = "ms-appinstaller:?source=";

/**
 * Chrome's `onUpdateAvailable` and `requestUpdateCheck`. In a package (the
 * Store's MSIX) the Store is asked for updates and installs them silently; a
 * package from elsewhere asks its `.appinstaller` file; in
 * a per-user install `winui-svelte/updater` checks the feed and unpacks the
 * new version.
 */
export class RuntimeUpdates {
  /** Fires once a newer version is ready (`version` is missing for a Store update); `reload` starts it. */
  readonly onUpdateAvailable = new ChromeEvent<(details: { version?: string }) => void>();

  private readonly source: RuntimeUpdateSource | undefined;
  private readonly currentVersion: string;
  private updater: Updater | undefined;
  private lastCheck = Number.NEGATIVE_INFINITY;
  private stagedVersion: string | undefined;

  private readonly storeBackend: StoreBackend | undefined;
  private readonly openUri: ((url: string) => Promise<boolean>) | undefined;

  constructor({ source, currentVersion, storeBackend, openUri }: {
    source: RuntimeUpdateSource | undefined;
    currentVersion: string;
    storeBackend?: StoreBackend;

    /** Opens a link; `launchUri` by default. The tests give one. */
    openUri?: (url: string) => Promise<boolean>;
  }) {
    this.source = source;
    this.currentVersion = currentVersion;
    this.storeBackend = storeBackend;
    this.openUri = openUri;
  }

  /**
   * Asks for a newer version: the Store in a Store package, the `.appinstaller`
   * file in a sideloaded one, else the feed (unpacked beside the running
   * version).
   *
   * @returns `no_update` with nothing to ask, `throttled` when asked again too soon.
   */
  async requestUpdateCheck() {
    const now = Date.now();
    const interval = this.source?.minimumIntervalMilliseconds ?? DEFAULT_THROTTLE_MILLISECONDS;
    const isThrottled = now - this.lastCheck < interval;
    if (isThrottled) {
      return {
        status: UpdateCheckStatus.THROTTLED
      } satisfies UpdateCheckResult;
    }

    this.lastCheck = now;
    const options = this.storeBackend && {
      backend: this.storeBackend
    };
    const { getPackageInfo } = await import("#src/store/identity.js");
    const info = getPackageInfo(options);
    const isUnpackaged = info === null;
    if (isUnpackaged) {
      return this.checkFeed();
    }

    if (!info.isFromStore) {
      return this.checkAppInstaller(options);
    }

    const { checkForUpdates } = await import("#src/store/updates.js");
    const reply = await checkForUpdates(options);
    if (reply.hasPackage) {
      return this.installFromStore(reply.value);
    }

    return this.checkFeed();
  }

  private async checkAppInstaller(options: { backend: StoreBackend } | undefined) {
    const appInstallerUrl = this.source?.appInstallerUrl;
    const hasNoAppInstaller = appInstallerUrl === undefined;
    if (hasNoAppInstaller) {
      return {
        status: UpdateCheckStatus.NO_UPDATE
      } satisfies UpdateCheckResult;
    }

    const { checkPackageUpdate } = await import("#src/store/package-update.js");
    const reply = await checkPackageUpdate(options);
    const isUpdateReady = reply.hasPackage
      && (reply.value === PackageUpdateState.available || reply.value === PackageUpdateState.required);
    if (!isUpdateReady) {
      return {
        status: UpdateCheckStatus.NO_UPDATE
      } satisfies UpdateCheckResult;
    }

    const openUri = this.openUri ?? (await import("#src/data-transfer/launcher.js")).launchUri;
    await openUri(`${APP_INSTALLER_SCHEME}${encodeURIComponent(appInstallerUrl)}`);
    this.onUpdateAvailable.dispatch({});
    return {
      status: UpdateCheckStatus.UPDATE_AVAILABLE
    } satisfies UpdateCheckResult;
  }

  private async installFromStore(check: UpdateCheck) {
    const hasNothing = check.updates.length === 0;
    if (hasNothing) {
      return {
        status: UpdateCheckStatus.NO_UPDATE
      } satisfies UpdateCheckResult;
    }

    await check.install();
    this.onUpdateAvailable.dispatch({});
    return {
      status: UpdateCheckStatus.UPDATE_AVAILABLE
    } satisfies UpdateCheckResult;
  }

  private async checkFeed() {
    const { source } = this;
    const hasNoFeed = source === undefined || source.appInstallerUrl !== undefined;
    if (hasNoFeed) {
      return {
        status: UpdateCheckStatus.NO_UPDATE
      } satisfies UpdateCheckResult;
    }

    this.updater ??= new Updater({
      ...source,
      currentVersion: this.currentVersion
    });
    const release = await this.updater.update();
    const isCurrent = release === undefined;
    if (isCurrent) {
      return {
        status: UpdateCheckStatus.NO_UPDATE
      } satisfies UpdateCheckResult;
    }

    this.stagedVersion = release.version;
    this.onUpdateAvailable.dispatch({
      version: release.version
    });
    return {
      status: UpdateCheckStatus.UPDATE_AVAILABLE,
      version: release.version
    } satisfies UpdateCheckResult;
  }

  /**
   * Starts the unpacked version, when there is one.
   *
   * @returns Whether a new version was started; false means the caller restarts the current one.
   */
  startStaged() {
    const version = this.stagedVersion;
    const isNothingStaged = version === undefined || this.updater === undefined;
    if (isNothingStaged) {
      return false;
    }

    this.updater?.restart({
      version
    });
    return true;
  }
}
