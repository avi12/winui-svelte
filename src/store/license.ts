import { NO_PACKAGE, packaged } from "./reply.ts";
import type { AppLicense, StoreBackend, StoreWindow } from "./types.ts";
import { windowsStoreBackend } from "./windows-backend.ts";
import { HandlerEventTarget } from "#src/web-apis/event-handlers.js";

const OFFLINE_LICENSES_CHANGED = "offlinelicenseschanged";

/** What `getAppLicense` takes. */
export interface LicenseOptions {
  /** The window that owns any Store dialog. */
  readonly window?: StoreWindow;

  /** Stands in for Windows; the tests give one. */
  readonly backend?: StoreBackend;
}

/**
 * The licence of this app in the Store: whether it is active, a trial, its
 * SKU and when it ends (`StoreContext.GetAppLicenseAsync`).
 *
 * @param options - Optional.
 * @returns The licence, or `hasPackage: false` outside a package.
 */
export async function getAppLicense({ window, backend = windowsStoreBackend() }: LicenseOptions = {}) {
  const isPackaged = backend.hasPackage();
  if (!isPackaged) {
    return NO_PACKAGE;
  }

  return packaged(await backend.license(window));
}

function keyOf(license: AppLicense) {
  return JSON.stringify([
    license.isActive,
    license.isTrial,
    license.skuStoreId,
    license.expirationDate?.getTime() ?? null
  ]);
}

/** What `watchLicense` takes. */
export interface WatchLicenseOptions extends LicenseOptions {
  /**
   * Also read the licence this often and raise the event when it changed.
   * Windows raises `OfflineLicensesChanged` on a thread of its own and the
   * runtime delivers only what is raised on the UI thread, so the event alone
   * may never arrive; a refund is only seen reliably with a poll. Off by
   * default; a minute is a fair value.
   */
  readonly pollMilliseconds?: number;
}

/**
 * Raises `offlinelicenseschanged` when the Store changes the licence of this
 * app (a refund, a purchase, a licence that lapsed). Read the new licence with
 * `getAppLicense`. With no package identity it raises nothing.
 */
export class LicenseWatcher extends HandlerEventTarget {
  /** False outside a package: the watcher is then inert. */
  readonly hasPackage: boolean;

  /** The failure of the last poll, or null. */
  error: unknown = null;
  private readonly stops: (() => void)[] = [];
  private lastKey: string | null = null;

  constructor({ window, pollMilliseconds, backend = windowsStoreBackend() }: WatchLicenseOptions = {}) {
    super();
    this.hasPackage = backend.hasPackage();

    if (!this.hasPackage) {
      return;
    }

    this.stops.push(backend.onOfflineLicensesChanged(() => this.dispatchEvent(new Event(OFFLINE_LICENSES_CHANGED))));
    const isPolling = pollMilliseconds !== undefined && pollMilliseconds > 0;
    if (isPolling) {
      this.stops.push(
        backend.poll({
          milliseconds: pollMilliseconds,
          tick: () => {
            this.check({
              window,
              backend
            }).catch((error: unknown) => {
              this.error = error;
            });
          }
        })
      );
    }
  }

  get onofflinelicenseschanged() {
    return this.getHandler(OFFLINE_LICENSES_CHANGED);
  }

  set onofflinelicenseschanged(handler: EventListener | null) {
    this.setHandler({
      type: OFFLINE_LICENSES_CHANGED,
      handler
    });
  }

  /** Stops listening and polling. */
  close() {
    for (const stop of this.stops.splice(0)) {
      stop();
    }
  }

  async check({ window, backend }: {
    window: StoreWindow | undefined;
    backend: StoreBackend;
  }) {
    const key = keyOf(await backend.license(window));
    const isChange = this.lastKey !== null && this.lastKey !== key;
    this.lastKey = key;
    this.error = null;

    if (isChange) {
      this.dispatchEvent(new Event(OFFLINE_LICENSES_CHANGED));
    }
  }
}

/**
 * Watches the licence of this app.
 *
 * @param options - Optional.
 * @returns The watcher; `close()` it when done.
 */
export function watchLicense(options: WatchLicenseOptions = {}) {
  return new LicenseWatcher(options);
}
