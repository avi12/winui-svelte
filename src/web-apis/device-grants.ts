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

  /** Whether a device is allowed. */
  has(id: string): boolean;

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
    has: id => granted.has(id),
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

/**
 * The shared body of `requestDevice` and `requestPort`: asks the chooser,
 * and allows what it returns.
 *
 * @param options - The chooser, the candidates, the grants to add to, the text of the `NotFoundError`
 *   for an empty answer, and how many may be chosen.
 * @returns The chosen devices, at most `maximum`.
 * @throws {DOMException} `NotAllowedError` without a chooser, `NotFoundError` when nothing is chosen.
 */
export async function chooseAndGrant<T extends { readonly id: string }>(options: {
  chooser: DeviceChooser<T> | undefined;
  candidates: readonly T[];
  signal?: AbortSignal;
  grants: DeviceGrants<T>;
  emptyMessage: string;
  maximum: number;
}) {
  const { chooser, candidates, signal, grants, emptyMessage, maximum } = options;
  const chosen = (await chooseDevices({
    chooser,
    candidates,
    ...signal === undefined ? {} : { signal }
  })).slice(0, maximum);
  const [first, ...rest] = chosen;
  const isEmpty = first === undefined;
  if (isEmpty) {
    throw domException({
      name: DomErrorName.NOT_FOUND,
      message: emptyMessage
    });
  }

  for (const device of chosen) {
    grants.grant(device);
  }

  const result: [T, ...T[]] = [first, ...rest];
  return result;
}
