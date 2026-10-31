import { DomErrorName, domException } from "./dom-exception.ts";
import { HandlerEventTarget } from "./event-handlers.ts";
import { DisplayRequest } from "./hardware-bindings.ts";
import { defineNavigatorProperty, defineProperty } from "./install.ts";
import { PermissionName, PermissionStateName, registerPermission } from "./permissions.ts";

const SCREEN_TYPE = "screen";

/** What keeps the display on: `acquire` starts one hold and returns how to end it. */
export interface WakeLockBackend {
  acquire(): () => void;
}

/**
 * Whether the page is visible, and when that changes. A wake lock is
 * released when the page is hidden; by default this is the page module's
 * document (`web-apis/page`), and a test gives its own.
 */
export interface WakeLockVisibility {
  isVisible(): boolean;
  onChange(callback: () => void): () => void;
}

/** What `installWakeLock` takes. */
export interface WakeLockInstallOptions {
  /** Stands in for `DisplayRequest`; the tests give one. */
  readonly backend?: WakeLockBackend;

  /**
   * The page's visibility; by default the page module's `document.hidden` and
   * `visibilitychange` (install `web-apis/page` first), and without a
   * document the page counts as always visible.
   */
  readonly visibility?: WakeLockVisibility;
}

declare global {
  // The extra joins the standard interface wherever this module is imported.
  interface WakeLock {
    /** How many locks are held right now. WinUI-only. */
    readonly activeCount: number;
  }
}

const VISIBILITY_CHANGE = "visibilitychange";

function pageVisibility() {
  return {
    isVisible() {
      const hasDocument = typeof globalThis.document === "object";
      return !hasDocument || !globalThis.document.hidden;
    },
    onChange(callback: () => void) {
      const hasDocument = typeof globalThis.document === "object";
      if (!hasDocument) {
        return () => undefined;
      }

      const { document } = globalThis;
      document.addEventListener(VISIBILITY_CHANGE, callback);
      return () => document.removeEventListener(VISIBILITY_CHANGE, callback);
    }
  } satisfies WakeLockVisibility;
}

/**
 * The real backend: one `DisplayRequest` per hold
 * (`RequestActive` and `RequestRelease`), which keeps the display from
 * turning off.
 *
 * @returns A backend over the Windows display request.
 */
export function windowsWakeLockBackend() {
  return {
    acquire() {
      const request = DisplayRequest.create();
      request.requestActive();
      return () => request.requestRelease();
    }
  } satisfies WakeLockBackend;
}

/** One held lock: a `release` event fires when it ends, however it ends. */
export class WakeLockSentinel extends HandlerEventTarget {
  readonly type = SCREEN_TYPE;
  private isReleased = false;
  private readonly onEnd: () => void;
  private readonly releaseHold: () => void;

  /** Made by `navigator.wakeLock.request`. */
  constructor(options: {
    releaseHold: () => void;
    onEnd: () => void;
  }) {
    super();
    this.releaseHold = options.releaseHold;
    this.onEnd = options.onEnd;
  }

  get released() {
    return this.isReleased;
  }

  get onrelease() {
    return this.getHandler("release");
  }

  set onrelease(handler: EventListener | null) {
    this.setHandler({
      type: "release",
      handler
    });
  }

  /**
   * Gives the lock back. Releasing twice does nothing the second time.
   *
   * @returns A promise that resolves once it is released.
   */
  async release() {
    if (this.isReleased) {
      return;
    }

    this.isReleased = true;
    this.releaseHold();
    this.onEnd();
    this.dispatchEvent(new Event("release"));
  }

  get [Symbol.toStringTag]() {
    return "WakeLockSentinel";
  }
}

/** The `navigator.wakeLock` object. */
export class WakeLock {
  private readonly backend: WakeLockBackend;
  private readonly visibility: WakeLockVisibility;
  private readonly held = new Set<WakeLockSentinel>();

  /** Made by `installWakeLock`. */
  constructor(options: {
    backend: WakeLockBackend;
    visibility: WakeLockVisibility;
  }) {
    this.backend = options.backend;
    this.visibility = options.visibility;
  }

  /** How many locks are held right now. WinUI-only. */
  get activeCount() {
    return this.held.size;
  }

  /**
   * Asks for a lock on the screen.
   *
   * @param type - Only `"screen"` exists.
   * @returns The sentinel; call `release()` on it, or let the page hide.
   * @throws {TypeError} When the type is not `"screen"`.
   * @throws {DOMException} `NotAllowedError` when the page is hidden.
   */
  async request(type: string = SCREEN_TYPE) {
    const isKnown = type === SCREEN_TYPE;
    if (!isKnown) {
      throw new TypeError(`'${type}' is not a valid value for enumeration WakeLockType`);
    }

    if (!this.visibility.isVisible()) {
      throw domException({
        name: DomErrorName.NOT_ALLOWED,
        message: "Wake Lock permission request denied: the page is not visible"
      });
    }

    const sentinel: WakeLockSentinel = new WakeLockSentinel({
      releaseHold: this.backend.acquire(),
      onEnd: () => this.held.delete(sentinel)
    });
    this.held.add(sentinel);
    return sentinel;
  }

  /**
   * Releases every lock held; used when the page hides and when the API is
   * uninstalled.
   *
   * @returns A promise that resolves once they are all released.
   */
  async releaseAll() {
    await Promise.all([...this.held].map(sentinel => sentinel.release()));
  }

  get [Symbol.toStringTag]() {
    return "WakeLock";
  }
}

/**
 * Defines `navigator.wakeLock` and `WakeLockSentinel`, and answers the
 * Permissions API's `screen-wake-lock` (always granted). Nothing is defined
 * until this is called.
 *
 * @param options - Test stand-ins for the display request and the page's visibility.
 * @returns The function that releases every lock and takes the API away again.
 */
export function installWakeLock(options: WakeLockInstallOptions = {}) {
  const visibility = options.visibility ?? pageVisibility();
  const wakeLock = new WakeLock({
    backend: options.backend ?? windowsWakeLockBackend(),
    visibility
  });
  const stopWatching = visibility.onChange(() => {
    if (!visibility.isVisible()) {
      void wakeLock.releaseAll();
    }
  });
  const uninstallNavigator = defineNavigatorProperty({
    name: "wakeLock",
    value: wakeLock
  });
  const uninstallGlobal = defineProperty({
    name: "WakeLockSentinel",
    value: WakeLockSentinel
  });
  const unregister = registerPermission({
    name: PermissionName.SCREEN_WAKE_LOCK,
    provider: {
      state: () => PermissionStateName.GRANTED
    }
  });
  return () => {
    unregister();
    uninstallGlobal();
    uninstallNavigator();
    stopWatching();
    void wakeLock.releaseAll();
  };
}
