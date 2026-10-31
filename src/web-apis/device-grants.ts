import { DomErrorName, domException } from "./dom-exception.ts";

/**
 * The picker `requestDevice` and `requestPort` ask: it is given what could be
 * chosen and answers with what the user chose, or nothing for a cancel. A
 * browser shows a dialog here; this package shows none, so the app supplies
 * the picker (its own dialog, a saved choice, or a test's answer).
 */
export type DeviceChooser<T> = (request: {
  readonly candidates: readonly T[];
  readonly signal?: AbortSignal;
}) => Promise<readonly T[]>;

/** The devices the user has allowed this page to use, by id. */
export interface DeviceGrants<T> {
  /** Allows a device. */
  grant(device: T): void;

  /** Allows a device no longer; true when it was allowed. */
  forget(id: string): boolean;

  /** The allowed devices. */
  list(): T[];

  /** Whether any device is allowed. */
  readonly hasAny: boolean;
}

/**
 * Starts an empty set of allowed devices.
 *
 * @returns The set.
 */
export function createDeviceGrants<T extends { readonly id: string }>() {
  const granted = new Map<string, T>();
  return {
    grant(device) {
      granted.set(device.id, device);
    },
    forget: id => granted.delete(id),
    list: () => [...granted.values()],
    get hasAny() {
      return granted.size > 0;
    }
  } satisfies DeviceGrants<T>;
}

/**
 * Asks the chooser which of the candidates the user wants.
 *
 * @param options - The chooser (absent when none is installed), the candidates, and an `AbortSignal`.
 * @returns What the user chose; empty when they cancelled.
 * @throws {DOMException} `NotAllowedError` when no chooser is installed.
 */
export async function chooseDevices<T>({ chooser, candidates, signal }: {
  chooser: DeviceChooser<T> | undefined;
  candidates: readonly T[];
  signal?: AbortSignal;
}) {
  const isMissing = chooser === undefined;
  if (isMissing) {
    throw domException({
      name: DomErrorName.NOT_ALLOWED,
      message: "no device chooser is installed: give the install function a chooser option"
    });
  }

  return chooser({
    candidates,
    ...signal === undefined ? {} : { signal }
  });
}
