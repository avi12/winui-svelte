import { ChromeEvent } from "#src/downloads/chrome-event.js";
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

/** Chrome's `onUpdateAvailable` and `requestUpdateCheck`, backed by `winui-svelte/updater`. */
export class RuntimeUpdates {
  /** Fires once a newer version is downloaded and unpacked; `reload` starts it. */
  readonly onUpdateAvailable = new ChromeEvent<(details: { version: string }) => void>();

  private readonly source: RuntimeUpdateSource | undefined;
  private readonly currentVersion: string;
  private updater: Updater | undefined;
  private lastCheck = Number.NEGATIVE_INFINITY;
  private stagedVersion: string | undefined;

  constructor({ source, currentVersion }: {
    source: RuntimeUpdateSource | undefined;
    currentVersion: string;
  }) {
    this.source = source;
    this.currentVersion = currentVersion;
  }

  /**
   * Checks the feed and unpacks a newer version beside the running one.
   *
   * @returns `no_update` with no update source configured, `throttled` when asked again too soon.
   */
  async requestUpdateCheck() {
    const { source } = this;
    const hasNoSource = source === undefined;
    if (hasNoSource) {
      return {
        status: UpdateCheckStatus.NO_UPDATE
      } satisfies UpdateCheckResult;
    }

    const now = Date.now();
    const isThrottled = now - this.lastCheck < (source.minimumIntervalMilliseconds ?? DEFAULT_THROTTLE_MILLISECONDS);
    if (isThrottled) {
      return {
        status: UpdateCheckStatus.THROTTLED
      } satisfies UpdateCheckResult;
    }

    this.lastCheck = now;
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
