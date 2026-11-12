import { ChromeEvent } from "#src/downloads/chrome-event.js";
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

/** Where a Squirrel-style install gets its updates; the running version comes from the manifest. */
export interface RuntimeUpdateSource extends Omit<UpdaterOptions, "currentVersion"> {
  /** Calls closer together than this answer `throttled`, as Chrome does; five minutes by default. */
  readonly minimumIntervalMilliseconds?: number;
}

/**
 * Chrome's `onUpdateAvailable` and `requestUpdateCheck`. In a package (the
 * Store's MSIX) the Store is asked for updates and installs them silently; in
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

  constructor({ source, currentVersion, storeBackend }: {
    source: RuntimeUpdateSource | undefined;
    currentVersion: string;
    storeBackend?: StoreBackend;
  }) {
    this.source = source;
    this.currentVersion = currentVersion;
    this.storeBackend = storeBackend;
  }

  /**
   * Asks for a newer version: the Store in a package, else the feed (unpacked
   * beside the running version).
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
    const { checkForUpdates } = await import("#src/store/updates.js");
    const reply = await checkForUpdates(
      this.storeBackend && {
        backend: this.storeBackend
      }
    );
    if (reply.hasPackage) {
      return this.installFromStore(reply.value);
    }

    return this.checkFeed();
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
    const hasNoSource = source === undefined;
    if (hasNoSource) {
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
