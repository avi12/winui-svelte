/**
 * How a Store update download and install stands
 * (`StorePackageUpdateState`).
 */
export const UpdateState = {
  pending: 0,
  downloading: 1,
  deploying: 2,
  completed: 3,
  canceled: 4,
  otherError: 5,
  errorLowBattery: 6,
  errorWifiRecommended: 7,
  errorWifiRequired: 8
} as const;

/** One of the values of `UpdateState`. */
export type UpdateState = (typeof UpdateState)[keyof typeof UpdateState];

/** Whether the app starts when the user signs in (`StartupTaskState`). */
export const StartupState = {
  disabled: 0,
  enabled: 1,
  disabledByUser: 2,
  disabledByPolicy: 3,
  enabledByPolicy: 4
} as const;

/** One of the values of `StartupState`. */
export type StartupState = (typeof StartupState)[keyof typeof StartupState];

/** Which stage of a package change a `PackageCatalog` event reports. */
export const PackageStage = {
  staging: "staging",
  installing: "installing",
  updating: "updating"
} as const;

/** One of the values of `PackageStage`. */
export type PackageStage = (typeof PackageStage)[keyof typeof PackageStage];

/** How the running package was signed (`PackageSignatureKind`). */
export const SignatureKind = {
  none: 0,
  developer: 1,
  enterprise: 2,
  store: 3,
  system: 4
} as const;

/** One of the values of `SignatureKind`. */
export type SignatureKind = (typeof SignatureKind)[keyof typeof SignatureKind];

/** Whether the package's own installer source has a newer version (`PackageUpdateAvailability`). */
export const PackageUpdateState = {
  unknown: 0,
  noUpdates: 1,
  available: 2,
  required: 3,
  error: 4
} as const;

/** One of the values of `PackageUpdateState`. */
export type PackageUpdateState = (typeof PackageUpdateState)[keyof typeof PackageUpdateState];

// The bindings type WinRT's enums as opaque classes (their metadata has no
// default interface), though the value is the number of the sets above.
function readerOf<T extends number>({ members, fallback }: {
  members: Readonly<Record<string, T>>;
  fallback: T;
}) {
  const byValue = new Map<unknown, T>(Object.values(members).map(value => [value, value]));
  return (value: unknown) => byValue.get(value) ?? fallback;
}

/**
 * The `UpdateState` of a value Windows gave.
 *
 * @param value - `StorePackageUpdateState` as the bindings hand it over.
 * @returns The state; `otherError` for one this package does not know.
 */
export const updateStateOf = readerOf({
  members: UpdateState,
  fallback: UpdateState.otherError
});

/**
 * The `StartupState` of a value Windows gave.
 *
 * @param value - `StartupTaskState` as the bindings hand it over.
 * @returns The state; `disabled` for one this package does not know.
 */
export const startupStateOf = readerOf({
  members: StartupState,
  fallback: StartupState.disabled
});

/**
 * The `SignatureKind` of a value Windows gave.
 *
 * @param value - `PackageSignatureKind` as the bindings hand it over.
 * @returns The kind; `none` for one this package does not know.
 */
export const signatureKindOf = readerOf({
  members: SignatureKind,
  fallback: SignatureKind.none
});

/**
 * The `PackageUpdateState` of a value Windows gave.
 *
 * @param value - `PackageUpdateAvailability` as the bindings hand it over.
 * @returns The state; `unknown` for one this package does not know.
 */
export const packageUpdateStateOf = readerOf({
  members: PackageUpdateState,
  fallback: PackageUpdateState.unknown
});
