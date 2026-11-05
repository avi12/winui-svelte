import { PackageStage } from "./states.ts";
import type { PackageProgress, StoreBackend } from "./types.ts";
import { windowsStoreBackend } from "./windows-backend.ts";
import { HandlerEventTarget } from "#src/web-apis/event-handlers.js";

const STAGING = `package${PackageStage.staging}`;
const INSTALLING = `package${PackageStage.installing}`;
const UPDATING = `package${PackageStage.updating}`;

/**
 * The event `PackageWatcher` raises: a package is staging, installing or
 * updating. Its type is `packagestaging`, `packageinstalling` or
 * `packageupdating`.
 */
export class PackageProgressEvent extends Event {
  readonly progress: PackageProgress;

  constructor(progress: PackageProgress) {
    super(`package${progress.stage}`);
    this.progress = progress;
  }
}

/**
 * Raises `packagestaging`, `packageinstalling` and `packageupdating`
 * (`PackageProgressEvent`) as the app's packages change (`PackageCatalog`),
 * each with the progress and a flag for the end. Windows raises these on a
 * thread of its own and the runtime delivers only what is raised on the UI
 * thread, so an event may never arrive: do not depend on it for anything
 * that must happen. With no package identity it raises nothing.
 */
export class PackageWatcher extends HandlerEventTarget {
  /** False outside a package: the watcher is then inert. */
  readonly hasPackage: boolean;
  private stop: (() => void) | null = null;

  constructor({ backend = windowsStoreBackend() }: { backend?: StoreBackend } = {}) {
    super();
    this.hasPackage = backend.hasPackage();

    if (this.hasPackage) {
      this.stop = backend.onPackageProgress(progress => this.dispatchEvent(new PackageProgressEvent(progress)));
    }
  }

  get onpackagestaging() {
    return this.getHandler(STAGING);
  }

  set onpackagestaging(handler: EventListener | null) {
    this.setHandler({
      type: STAGING,
      handler
    });
  }

  get onpackageinstalling() {
    return this.getHandler(INSTALLING);
  }

  set onpackageinstalling(handler: EventListener | null) {
    this.setHandler({
      type: INSTALLING,
      handler
    });
  }

  get onpackageupdating() {
    return this.getHandler(UPDATING);
  }

  set onpackageupdating(handler: EventListener | null) {
    this.setHandler({
      type: UPDATING,
      handler
    });
  }

  /** Stops listening. */
  close() {
    this.stop?.();
    this.stop = null;
  }
}

/**
 * Watches the app's packages as they change.
 *
 * @param options - Optional; `backend` stands in for Windows in tests.
 * @returns The watcher; `close()` it when done.
 */
export function watchPackages(options: { backend?: StoreBackend } = {}) {
  return new PackageWatcher(options);
}
