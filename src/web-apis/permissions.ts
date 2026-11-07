import { HandlerEventTarget } from "./event-handlers.ts";
import { defineNavigatorProperty } from "./install.ts";

/** The Permissions API's states. */
export const PermissionStateName = {
  GRANTED: "granted",
  DENIED: "denied",
  PROMPT: "prompt"
} as const;
/** One of the values of `PermissionStateName`. */
export type PermissionStateName = (typeof PermissionStateName)[keyof typeof PermissionStateName];

/** The permissions the Web APIs register with the Permissions API. */
export const PermissionName = {
  ACCELEROMETER: "accelerometer",
  AMBIENT_LIGHT_SENSOR: "ambient-light-sensor",
  BLUETOOTH: "bluetooth",
  CAMERA: "camera",
  CLIPBOARD_READ: "clipboard-read",
  CLIPBOARD_WRITE: "clipboard-write",
  GEOLOCATION: "geolocation",
  GYROSCOPE: "gyroscope",
  IDLE_DETECTION: "idle-detection",
  MAGNETOMETER: "magnetometer",
  MICROPHONE: "microphone",
  NOTIFICATIONS: "notifications",
  PERSISTENT_STORAGE: "persistent-storage",
  PUSH: "push",
  SCREEN_WAKE_LOCK: "screen-wake-lock",
  WINDOW_MANAGEMENT: "window-management"
} as const;
/** One of the values of `PermissionName`. */
export type PermissionName = (typeof PermissionName)[keyof typeof PermissionName];

/** What answers `navigator.permissions.query({ name })` for one permission. */
export interface PermissionProvider {
  state(): PermissionStateName;

  /** Asks the system for the permission (its prompt); absent when there is none to show. */
  request?(): Promise<PermissionStateName>;
}

const providers = new Map<string, PermissionProvider>();
const liveStatuses = new Map<string, Set<WeakRef<PermissionStatus>>>();

/** The result of `navigator.permissions.query`, an `EventTarget` that fires `change`. */
export class PermissionStatus extends HandlerEventTarget {
  readonly name: string;
  state: PermissionStateName;

  /** Made by `navigator.permissions.query`. */
  constructor({ name, state }: {
    name: string;
    state: PermissionStateName;
  }) {
    super();
    this.name = name;
    this.state = state;
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

  get [Symbol.toStringTag]() {
    return "PermissionStatus";
  }
}

/**
 * Makes an API's permission answerable by the Permissions API.
 *
 * @param options - The permission's name (as the spec has it) and its provider.
 * @returns The function that unregisters it.
 */
export function registerPermission({ name, provider }: {
  name: PermissionName;
  provider: PermissionProvider;
}) {
  providers.set(name, provider);
  return () => {
    providers.delete(name);
  };
}

/**
 * Reads a registered permission.
 *
 * @param name - The permission's name.
 * @returns Its state; undefined when no API registered it.
 */
export function readPermission(name: string) {
  return providers.get(name)?.state();
}

/**
 * Asks the system for a registered permission through its provider's
 * `request`, then reads it again.
 *
 * @param name - The permission's name.
 * @returns Its state afterwards; undefined when no API registered it.
 */
export async function requestPermission(name: string) {
  const provider = providers.get(name);
  const isUnknown = provider === undefined;
  if (isUnknown) {
    return undefined;
  }

  const answer = await provider.request?.();
  return answer ?? provider.state();
}

/**
 * Tells the open `PermissionStatus` objects of a permission to re-read it;
 * those whose state changed fire `change`.
 *
 * @param name - The permission's name.
 */
export function announcePermissionChange(name: PermissionName) {
  const provider = providers.get(name);
  const statuses = liveStatuses.get(name);
  const isUnknown = provider === undefined || statuses === undefined;
  if (isUnknown) {
    return;
  }

  for (const reference of statuses) {
    const status = reference.deref();
    const isCollected = status === undefined;
    if (isCollected) {
      statuses.delete(reference);
      continue;
    }

    const state = provider.state();
    const hasChanged = state !== status.state;
    if (hasChanged) {
      status.state = state;
      status.dispatchEvent(new Event("change"));
    }
  }
}

/** The `navigator.permissions` object. */
export class Permissions {
  /**
   * Reads a permission.
   *
   * @param descriptor - An object with the permission's `name`.
   * @returns The permission's status.
   * @throws {TypeError} When the name is not a permission this runtime knows.
   */
  async query(descriptor: { name: string }) {
    const { name } = descriptor;
    const provider = providers.get(name);
    const isUnknown = provider === undefined;
    if (isUnknown) {
      throw new TypeError(`'${name}' is not a valid value for enumeration PermissionName`);
    }

    const status = new PermissionStatus({
      name,
      state: provider.state()
    });
    const known = liveStatuses.get(name) ?? new Set<WeakRef<PermissionStatus>>();
    known.add(new WeakRef(status));
    liveStatuses.set(name, known);
    return status;
  }

  get [Symbol.toStringTag]() {
    return "Permissions";
  }
}

/**
 * Defines `navigator.permissions`. Other APIs register their permission with
 * `registerPermission` when they are installed, so install this one first or
 * last; the order does not matter.
 *
 * @returns The function that takes it away again.
 */
export function installPermissions() {
  return defineNavigatorProperty({
    name: "permissions",
    value: new Permissions()
  });
}
