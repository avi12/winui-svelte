import { DomErrorName, domException } from "./dom-exception.ts";
import { HandlerEventTarget } from "./event-handlers.ts";
import { defineProperty } from "./install.ts";
import { announcePermissionChange, PermissionStateName, registerPermission } from "./permissions.ts";
import { createIdleReader } from "#src/devices/native.js";

const PERMISSION_NAME = "idle-detection";
const MINIMUM_THRESHOLD = 60_000;
const POLL_MILLISECONDS = 1000;

/** The two values of `IdleDetector.userState`. */
export const UserIdleState = {
  ACTIVE: "active",
  IDLE: "idle"
} as const;
/** One of the values of `UserIdleState`. */
export type UserIdleState = (typeof UserIdleState)[keyof typeof UserIdleState];

/** The two values of `IdleDetector.screenState`. */
export const ScreenIdleState = {
  LOCKED: "locked",
  UNLOCKED: "unlocked"
} as const;
/** One of the values of `ScreenIdleState`. */
export type ScreenIdleState = (typeof ScreenIdleState)[keyof typeof ScreenIdleState];

/** What the machine says right now. */
export interface IdleReading {
  /** Milliseconds since the last keyboard or mouse input of the session. */
  readonly idleMilliseconds: number;

  /** Whether the session is locked. */
  readonly isLocked: boolean;
}

/** Where the readings come from: `observe` calls back whenever a new reading is due. */
export interface IdleBackend {
  read(): IdleReading;
  observe(onTick: () => void): () => void;
}

/** What `installIdleDetector` takes. */
export interface IdleInstallOptions {
  /** Stands in for the Win32 calls; the tests give one. */
  readonly backend?: IdleBackend;

  /** What `IdleDetector.requestPermission()` answers; granted by default, as Windows asks nothing. */
  readonly permission?: "granted" | "denied";
}

/**
 * The real backend: the idle time and lock state of the session
 * (`createIdleReader`), read once a second.
 *
 * @returns A backend over Win32.
 */
export function windowsIdleBackend() {
  return {
    read: createIdleReader(),
    observe(onTick) {
      const timer = setInterval(onTick, POLL_MILLISECONDS);
      timer.unref();
      return () => clearInterval(timer);
    }
  } satisfies IdleBackend;
}

interface IdleContext {
  readonly backend: IdleBackend;
  readonly answer: "granted" | "denied";
  permission: PermissionStateName;
}

let context: IdleContext | undefined;

function requireContext() {
  if (!context) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "IdleDetector is not installed: call installIdleDetector() first"
    });
  }

  return context;
}

/**
 * The web `IdleDetector` over Win32 input and session state. `start`
 * resolves once the first state is known; `change` fires after that whenever
 * `userState` or `screenState` differs.
 */
export class IdleDetector extends HandlerEventTarget {
  private currentUserState: UserIdleState | null = null;
  private currentScreenState: ScreenIdleState | null = null;
  private currentIdleMilliseconds: number | null = null;

  /** Whether the user is `active` or `idle`; `null` before `start` resolves. */
  get userState() {
    return this.currentUserState;
  }

  /** Whether the session is `locked` or `unlocked`; `null` before `start` resolves. */
  get screenState() {
    return this.currentScreenState;
  }

  /** Milliseconds since the last input, as of the last reading; `null` before `start` resolves. WinUI-only. */
  get idleMilliseconds() {
    return this.currentIdleMilliseconds;
  }

  get onchange() {
    return this.getHandler("change");
  }

  set onchange(handler: EventListener | null) {
    this.setHandler({
      type: "change",
      handler
    });
  }

  /**
   * Asks to detect idleness. Windows asks the user nothing, so this grants
   * unless the install was told otherwise.
   *
   * @returns `"granted"` or `"denied"`.
   */
  static async requestPermission() {
    const known = requireContext();
    const isUndecided = known.permission === PermissionStateName.PROMPT;
    if (isUndecided) {
      known.permission = known.answer;
      announcePermissionChange(PERMISSION_NAME);
    }

    return known.permission === PermissionStateName.GRANTED ? "granted" : "denied";
  }

  /**
   * Starts watching.
   *
   * @param options - `threshold` in milliseconds (60000 or more, the default) and an `AbortSignal` that stops it.
   * @returns A promise that resolves with the first state read.
   * @throws {TypeError} When the threshold is under 60000.
   * @throws {DOMException} `NotAllowedError` when permission was not granted; the signal's reason when it aborts.
   */
  async start(options: {
    threshold?: number;
    signal?: AbortSignal;
  } = {}) {
    const { threshold = MINIMUM_THRESHOLD, signal } = options;
    const known = requireContext();
    const isTooSmall = !(threshold >= MINIMUM_THRESHOLD);
    if (isTooSmall) {
      throw new TypeError(`Failed to execute 'start' on 'IdleDetector': threshold must be at least ${MINIMUM_THRESHOLD}`);
    }

    signal?.throwIfAborted();
    const isDenied = known.permission !== PermissionStateName.GRANTED;
    if (isDenied) {
      throw domException({
        name: DomErrorName.NOT_ALLOWED,
        message: "Idle detection permission denied"
      });
    }

    const update = () => this.update({
      reading: known.backend.read(),
      threshold
    });
    update();
    const stop = known.backend.observe(() => {
      const hasChanged = update();
      if (hasChanged) {
        this.dispatchEvent(new Event("change"));
      }
    });
    signal?.addEventListener("abort", stop, { once: true });
  }

  private update({ reading, threshold }: {
    reading: IdleReading;
    threshold: number;
  }) {
    const userState = reading.idleMilliseconds >= threshold ? UserIdleState.IDLE : UserIdleState.ACTIVE;
    const screenState = reading.isLocked ? ScreenIdleState.LOCKED : ScreenIdleState.UNLOCKED;
    const hasChanged = userState !== this.currentUserState || screenState !== this.currentScreenState;
    this.currentUserState = userState;
    this.currentScreenState = screenState;
    this.currentIdleMilliseconds = reading.idleMilliseconds;
    return hasChanged;
  }

  get [Symbol.toStringTag]() {
    return "IdleDetector";
  }
}

/**
 * Defines `globalThis.IdleDetector` and answers the Permissions API's
 * `idle-detection`. Nothing is defined until this is called.
 *
 * @param options - Test stand-ins and the permission answer.
 * @returns The function that takes it away again.
 */
export function installIdleDetector(options: IdleInstallOptions = {}) {
  const previousContext = context;
  const installed: IdleContext = {
    backend: options.backend ?? windowsIdleBackend(),
    answer: options.permission ?? PermissionStateName.GRANTED,
    permission: PermissionStateName.PROMPT
  };
  context = installed;
  const uninstallGlobal = defineProperty({
    name: "IdleDetector",
    value: IdleDetector
  });
  const unregister = registerPermission({
    name: PERMISSION_NAME,
    provider: {
      state: () => installed.permission
    }
  });
  return () => {
    unregister();
    uninstallGlobal();
    context = previousContext;
  };
}
