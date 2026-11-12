import { defineNavigatorProperty, defineProperty } from "./install.ts";
import { announcePermissionChange, PermissionName, PermissionStateName, registerPermission } from "./permissions.ts";
import { dateOfWindowsTime } from "#src/devices/property-value.js";
import { Geolocator } from "#winui/windows/devices/geolocation/Geolocator";

const HIGH_ACCURACY_METERS = 10;
const ACCESS_DENIED_PATTERN = /0x80070005|access is denied/iu;
const TIMEOUT_PATTERN = /0x800705b4|timed out|timeout/iu;
const TICKS_PER_MILLISECOND = 10_000;
const MAXIMUM_TICKS = 9_223_372_036_854_775_807n;

/** The numbers `GeolocationAccessStatus` has (the binding is a placeholder). */
const ACCESS_STATUS = {
  UNSPECIFIED: 0,
  ALLOWED: 1,
  DENIED: 2
} as const;

/** The names of `PositionSource`, by the number Windows reports. */
const POSITION_SOURCES = ["cellular", "satellite", "wifi", "ip-address", "unknown", "default", "obfuscated"] as const;

/** Where a position came from; WinUI-only. */
export type GeolocationPositionSource = (typeof POSITION_SOURCES)[number];

/** The three reasons a position can fail, and the `code` each becomes. */
export const GeolocationFailureReason = {
  DENIED: "denied",
  UNAVAILABLE: "unavailable",
  TIMEOUT: "timeout"
} as const;
/** One of the values of `GeolocationFailureReason`. */
export type GeolocationFailureReason = (typeof GeolocationFailureReason)[keyof typeof GeolocationFailureReason];

/** What a `GeolocationBackend` rejects with; anything else counts as `unavailable`. */
export class GeolocationFailure extends Error {
  readonly reason: GeolocationFailureReason;

  /** Made by a backend. */
  constructor({ reason, message }: {
    reason: GeolocationFailureReason;
    message: string;
  }) {
    super(message);
    this.reason = reason;
  }
}

/** The answer of a backend to "may this app read the location". */
export const GeolocationAccess = {
  ALLOWED: "allowed",
  DENIED: "denied",
  UNSPECIFIED: "unspecified"
} as const;
/** One of the values of `GeolocationAccess`. */
export type GeolocationAccess = (typeof GeolocationAccess)[keyof typeof GeolocationAccess];

/** The address Windows resolved for a position; an empty string is unknown. */
export interface CivicAddress {
  readonly country: string;
  readonly state: string;
  readonly city: string;
  readonly postalCode: string;
}

/** Dilutions of precision from the satellites; null where Windows did not report one. */
export interface SatelliteData {
  readonly positionDilutionOfPrecision: number | null;
  readonly horizontalDilutionOfPrecision: number | null;
  readonly verticalDilutionOfPrecision: number | null;
  readonly geometricDilutionOfPrecision: number | null;
  readonly timeDilutionOfPrecision: number | null;
}

/** One position as a backend reports it. */
export interface GeolocationFix {
  readonly latitude: number;
  readonly longitude: number;
  readonly altitude: number | null;
  readonly accuracy: number;
  readonly altitudeAccuracy: number | null;
  readonly heading: number | null;
  readonly speed: number | null;

  /** Milliseconds since 1970. */
  readonly timestamp: number;
  readonly positionSource: GeolocationPositionSource;
  readonly isRemoteSource: boolean;
  readonly satelliteData: SatelliteData | null;
  readonly civicAddress: CivicAddress | null;
}

/** How a backend is asked for a position. */
export interface GeolocationRequest {
  readonly isHighAccuracy: boolean;
  readonly maximumAgeMilliseconds: number;
  readonly timeoutMilliseconds: number;
  readonly desiredAccuracyInMeters: number | undefined;
  readonly reportInterval: number | undefined;
  readonly movementThreshold: number | undefined;
}

/** What watching a position takes. */
export interface GeolocationWatch {
  readonly request: GeolocationRequest;
  readonly onFix: (fix: GeolocationFix) => void;
  readonly onFailure: (failure: GeolocationFailure) => void;
}

/** Stands between `navigator.geolocation` and Windows; the tests give their own. */
export interface GeolocationBackend {
  requestAccess(): Promise<GeolocationAccess>;
  getFix(request: GeolocationRequest): Promise<GeolocationFix>;

  /** Starts reporting changes; returns how to stop. */
  watch(watch: GeolocationWatch): () => void;
}

/** What Windows adds to the standard `PositionOptions`. Every member is optional and a browser ignores it. */
export interface GeolocationOptionExtras {
  /** Wins over `enableHighAccuracy`: the accuracy wanted, in meters. */
  readonly desiredAccuracyInMeters?: number;

  /** The shortest time between two reports of a watch, in milliseconds. */
  readonly reportInterval?: number;

  /** The distance in meters a watched device must move before a new report. */
  readonly movementThreshold?: number;
}

declare global {
  // The extras join the standard options wherever this module is imported.
  interface PositionOptions extends GeolocationOptionExtras {}
}

/** The codes of `GeolocationPositionError`. */
export const GeolocationErrorCode = {
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3
} as const;

/** Why a position could not be had; passed to the error callback. */
export class GeolocationPositionError {
  static readonly PERMISSION_DENIED = GeolocationErrorCode.PERMISSION_DENIED;
  static readonly POSITION_UNAVAILABLE = GeolocationErrorCode.POSITION_UNAVAILABLE;
  static readonly TIMEOUT = GeolocationErrorCode.TIMEOUT;
  readonly PERMISSION_DENIED = GeolocationErrorCode.PERMISSION_DENIED;
  readonly POSITION_UNAVAILABLE = GeolocationErrorCode.POSITION_UNAVAILABLE;
  readonly TIMEOUT = GeolocationErrorCode.TIMEOUT;
  readonly code: number;
  readonly message: string;

  /** Made by `navigator.geolocation`. */
  constructor({ code, message }: {
    code: number;
    message: string;
  }) {
    this.code = code;
    this.message = message;
  }

  get [Symbol.toStringTag]() {
    return "GeolocationPositionError";
  }
}

/** The `coords` of a position. */
export class GeolocationCoordinates {
  readonly latitude: number;
  readonly longitude: number;
  readonly altitude: number | null;
  readonly accuracy: number;
  readonly altitudeAccuracy: number | null;
  readonly heading: number | null;
  readonly speed: number | null;

  /** Made by `navigator.geolocation`. */
  constructor(fix: GeolocationFix) {
    this.latitude = fix.latitude;
    this.longitude = fix.longitude;
    this.altitude = fix.altitude;
    this.accuracy = fix.accuracy;
    this.altitudeAccuracy = fix.altitudeAccuracy;
    this.heading = fix.heading;
    this.speed = fix.speed;
  }

  toJSON() {
    return {
      latitude: this.latitude,
      longitude: this.longitude,
      altitude: this.altitude,
      accuracy: this.accuracy,
      altitudeAccuracy: this.altitudeAccuracy,
      heading: this.heading,
      speed: this.speed
    };
  }

  get [Symbol.toStringTag]() {
    return "GeolocationCoordinates";
  }
}

/** A position, passed to the success callback. */
export class GeolocationPosition {
  readonly coords: GeolocationCoordinates;
  readonly timestamp: number;

  /** Where the position came from: satellite, wifi, ip-address and so on. WinUI-only. */
  readonly positionSource: GeolocationPositionSource;

  /** Whether another device reported it. WinUI-only. */
  readonly isRemoteSource: boolean;

  /** Satellite precision, or null when it did not come from satellites. WinUI-only. */
  readonly satelliteData: SatelliteData | null;

  /** The street address Windows knows for the place, or null. WinUI-only. */
  readonly civicAddress: CivicAddress | null;

  /** Made by `navigator.geolocation`. */
  constructor(fix: GeolocationFix) {
    this.coords = new GeolocationCoordinates(fix);
    this.timestamp = fix.timestamp;
    this.positionSource = fix.positionSource;
    this.isRemoteSource = fix.isRemoteSource;
    this.satelliteData = fix.satelliteData;
    this.civicAddress = fix.civicAddress;
  }

  toJSON() {
    return {
      coords: this.coords.toJSON(),
      timestamp: this.timestamp
    };
  }

  get [Symbol.toStringTag]() {
    return "GeolocationPosition";
  }
}

type SuccessCallback = (position: GeolocationPosition) => void;
type ErrorCallback = (error: GeolocationPositionError) => void;

interface Watching {
  isCleared: boolean;
  stop: (() => void) | undefined;
}

const FAILURE_CODES = new Map<GeolocationFailureReason, number>([
  [GeolocationFailureReason.DENIED, GeolocationErrorCode.PERMISSION_DENIED],
  [GeolocationFailureReason.TIMEOUT, GeolocationErrorCode.TIMEOUT]
]);

function asFailure(error: unknown) {
  const isFailure = error instanceof GeolocationFailure;
  if (isFailure) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const isDenied = ACCESS_DENIED_PATTERN.test(message);
  if (isDenied) {
    return new GeolocationFailure({
      reason: GeolocationFailureReason.DENIED,
      message
    });
  }

  const isTimeout = TIMEOUT_PATTERN.test(message);
  return new GeolocationFailure({
    reason: isTimeout ? GeolocationFailureReason.TIMEOUT : GeolocationFailureReason.UNAVAILABLE,
    message
  });
}

function requireCallback({ method, callback }: {
  method: string;
  callback: unknown;
}) {
  const isFunction = typeof callback === "function";
  if (!isFunction) {
    throw new TypeError(`Failed to execute '${method}' on 'Geolocation': The callback provided as parameter 1 is not a function.`);
  }
}

function positionError(failure: GeolocationFailure) {
  return new GeolocationPositionError({
    code: FAILURE_CODES.get(failure.reason) ?? GeolocationErrorCode.POSITION_UNAVAILABLE,
    message: failure.message
  });
}

function requestOf(options: PositionOptions | undefined) {
  const maximumAge = options?.maximumAge ?? 0;
  const timeout = options?.timeout ?? Infinity;
  return {
    isHighAccuracy: options?.enableHighAccuracy ?? false,
    maximumAgeMilliseconds: Math.max(0, maximumAge),
    timeoutMilliseconds: Math.max(0, timeout),
    desiredAccuracyInMeters: options?.desiredAccuracyInMeters,
    reportInterval: options?.reportInterval,
    movementThreshold: options?.movementThreshold
  } satisfies GeolocationRequest;
}

/** The `navigator.geolocation` object. */
export class Geolocation {
  private readonly backend: GeolocationBackend;
  private readonly watches = new Map<number, Watching>();
  private readonly onAccess: (access: GeolocationAccess) => void;
  private nextWatchId = 1;

  /** Made by `installGeolocation`. */
  constructor({ backend, onAccess }: {
    backend: GeolocationBackend;
    onAccess: (access: GeolocationAccess) => void;
  }) {
    this.backend = backend;
    this.onAccess = onAccess;
  }

  /**
   * Reads the position once.
   *
   * @param success - Called with the position.
   * @param error - Called with a `GeolocationPositionError` when it fails.
   * @param options - The standard `PositionOptions`, and the WinUI extras.
   */
  getCurrentPosition(success: SuccessCallback, error?: ErrorCallback | null, options?: PositionOptions) {
    requireCallback({
      method: "getCurrentPosition",
      callback: success
    });

    void this.fetchOnce({
      success,
      error,
      request: requestOf(options)
    });
  }

  /**
   * Starts watching the position.
   *
   * @param success - Called with each position.
   * @param error - Called with a `GeolocationPositionError` when it fails.
   * @param options - The standard `PositionOptions`, and the WinUI extras.
   * @returns The id that `clearWatch` takes.
   */
  watchPosition(success: SuccessCallback, error?: ErrorCallback | null, options?: PositionOptions) {
    requireCallback({
      method: "watchPosition",
      callback: success
    });

    const id = this.nextWatchId;
    this.nextWatchId += 1;
    const watching: Watching = {
      isCleared: false,
      stop: undefined
    };
    this.watches.set(id, watching);
    void this.startWatch({
      watching,
      success,
      error,
      request: requestOf(options)
    });
    return id;
  }

  /**
   * Stops a watch.
   *
   * @param id - What `watchPosition` returned.
   */
  clearWatch(id: number) {
    const watching = this.watches.get(id);
    if (!watching) {
      return;
    }

    watching.isCleared = true;
    watching.stop?.();
    this.watches.delete(id);
  }

  private async mayRead() {
    const access = await this.backend.requestAccess();
    this.onAccess(access);
    return access !== GeolocationAccess.DENIED;
  }

  private async fetchOnce({ success, error, request }: {
    success: SuccessCallback;
    error: ErrorCallback | null | undefined;
    request: GeolocationRequest;
  }) {
    try {
      const isAllowed = await this.mayRead();
      if (!isAllowed) {
        error?.(
          new GeolocationPositionError({
            code: GeolocationErrorCode.PERMISSION_DENIED,
            message: "User denied Geolocation"
          })
        );
        return;
      }

      success(new GeolocationPosition(await this.backend.getFix(request)));
    } catch (caught) {
      error?.(positionError(asFailure(caught)));
    }
  }

  private async startWatch({ watching, success, error, request }: {
    watching: Watching;
    success: SuccessCallback;
    error: ErrorCallback | null | undefined;
    request: GeolocationRequest;
  }) {
    const isAllowed = await this.mayRead().catch(() => false);
    if (watching.isCleared) {
      return;
    }

    if (!isAllowed) {
      error?.(
        new GeolocationPositionError({
          code: GeolocationErrorCode.PERMISSION_DENIED,
          message: "User denied Geolocation"
        })
      );
      return;
    }

    watching.stop = this.backend.watch({
      request,
      onFix(fix) {
        success(new GeolocationPosition(fix));
      },
      onFailure(failure) {
        error?.(positionError(failure));
      }
    });
  }

  get [Symbol.toStringTag]() {
    return "Geolocation";
  }
}

const ACCESS_BY_STATUS = new Map<unknown, GeolocationAccess>([
  [ACCESS_STATUS.ALLOWED, GeolocationAccess.ALLOWED],
  [ACCESS_STATUS.DENIED, GeolocationAccess.DENIED]
]);

function nullIfNaN(value: number | null) {
  const isNumber = typeof value === "number" && !Number.isNaN(value);
  return isNumber ? value : null;
}

function sourceOf(source: unknown) {
  const isKnown = typeof source === "number" && source >= 0 && source < POSITION_SOURCES.length;
  return isKnown ? POSITION_SOURCES[source] ?? "unknown" : "unknown";
}

function ticksOf(milliseconds: number) {
  const isUnbounded = !Number.isFinite(milliseconds);
  return { duration: isUnbounded ? MAXIMUM_TICKS : BigInt(Math.round(milliseconds * TICKS_PER_MILLISECOND)) };
}

function fixOf(position: Awaited<ReturnType<Geolocator["getGeopositionAsync"]>>) {
  const { coordinate, civicAddress } = position;
  const satellite = coordinate.satelliteData;
  const hasCivic = civicAddress != null && civicAddress.country !== "";
  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    altitude: nullIfNaN(coordinate.altitude),
    accuracy: coordinate.accuracy,
    altitudeAccuracy: nullIfNaN(coordinate.altitudeAccuracy),
    heading: nullIfNaN(coordinate.heading),
    speed: nullIfNaN(coordinate.speed),
    timestamp: dateOfWindowsTime(coordinate.timestamp.universalTime).getTime(),
    positionSource: sourceOf(coordinate.positionSource),
    isRemoteSource: coordinate.isRemoteSource,
    satelliteData: satellite == null ? null : {
      positionDilutionOfPrecision: satellite.positionDilutionOfPrecision,
      horizontalDilutionOfPrecision: satellite.horizontalDilutionOfPrecision,
      verticalDilutionOfPrecision: satellite.verticalDilutionOfPrecision,
      geometricDilutionOfPrecision: satellite.geometricDilutionOfPrecision,
      timeDilutionOfPrecision: satellite.timeDilutionOfPrecision
    },
    civicAddress: hasCivic ? {
      country: civicAddress.country,
      state: civicAddress.state,
      city: civicAddress.city,
      postalCode: civicAddress.postalCode
    } : null
  } satisfies GeolocationFix;
}

function locatorFor(request: GeolocationRequest) {
  const locator = Geolocator.create();
  const meters = request.desiredAccuracyInMeters ?? (request.isHighAccuracy ? HIGH_ACCURACY_METERS : undefined);
  Object.assign(locator, {
    ...meters === undefined ? {} : { desiredAccuracyInMeters: meters },
    ...request.reportInterval === undefined ? {} : { reportInterval: request.reportInterval },
    ...request.movementThreshold === undefined ? {} : { movementThreshold: request.movementThreshold }
  });
  return locator;
}

/**
 * The backend over `Windows.Devices.Geolocation.Geolocator`. The Windows
 * location switch must be on; with it off, `requestAccess` answers denied.
 *
 * @returns A backend for `installGeolocation`.
 */
export function windowsGeolocationBackend() {
  return {
    async requestAccess() {
      return ACCESS_BY_STATUS.get(await Geolocator.requestAccessAsync()) ?? GeolocationAccess.UNSPECIFIED;
    },
    async getFix(request) {
      const locator = locatorFor(request);
      return fixOf(
        await locator.getGeopositionAsync(
          ticksOf(request.maximumAgeMilliseconds),
          ticksOf(request.timeoutMilliseconds)
        )
      );
    },
    watch({ request, onFix, onFailure }) {
      const locator = locatorFor(request);
      const stopPositions = locator.onPositionChanged((_sender, event) => {
        onFix(fixOf(event.position));
      });
      const stopStatus = locator.onStatusChanged((_sender, event) => {
        const status: unknown = event.status;
        const isDisabled = status === 1;
        if (isDisabled) {
          onFailure(
            new GeolocationFailure({
              reason: GeolocationFailureReason.DENIED,
              message: "Location is turned off in Windows"
            })
          );
        }
      });
      return () => {
        stopPositions();
        stopStatus();
      };
    }
  } satisfies GeolocationBackend;
}

const PERMISSION_BY_ACCESS = new Map<GeolocationAccess, PermissionStateName>([
  [GeolocationAccess.ALLOWED, PermissionStateName.GRANTED],
  [GeolocationAccess.DENIED, PermissionStateName.DENIED]
]);

/** What `installGeolocation` takes. */
export interface GeolocationInstallOptions {
  /** Stands in for Windows; the tests give one. */
  readonly backend?: GeolocationBackend;
}

/**
 * Defines `navigator.geolocation`, the `Geolocation`, `GeolocationPosition`,
 * `GeolocationCoordinates` and `GeolocationPositionError` globals, and
 * answers the Permissions API's `geolocation`. Nothing is defined until this
 * is called.
 *
 * @param options - Test stand-ins.
 * @returns The function that takes it away again.
 */
export function installGeolocation(options: GeolocationInstallOptions = {}) {
  let access: GeolocationAccess = GeolocationAccess.UNSPECIFIED;
  const backend = options.backend ?? windowsGeolocationBackend();
  function onAccess(latest: GeolocationAccess) {
    const hasChanged = latest !== access;
    access = latest;

    if (hasChanged) {
      announcePermissionChange(PermissionName.GEOLOCATION);
    }
  }
  const geolocation = new Geolocation({
    backend,
    onAccess
  });
  const uninstalls = [
    defineNavigatorProperty({
      name: "geolocation",
      value: geolocation
    }),
    defineProperty({
      name: "Geolocation",
      value: Geolocation
    }),
    defineProperty({
      name: "GeolocationPosition",
      value: GeolocationPosition
    }),
    defineProperty({
      name: "GeolocationCoordinates",
      value: GeolocationCoordinates
    }),
    defineProperty({
      name: "GeolocationPositionError",
      value: GeolocationPositionError
    }),
    registerPermission({
      name: PermissionName.GEOLOCATION,
      provider: {
        state() {
          return PERMISSION_BY_ACCESS.get(access) ?? PermissionStateName.PROMPT;
        },
        async request() {
          onAccess(await backend.requestAccess());
          return PERMISSION_BY_ACCESS.get(access) ?? PermissionStateName.PROMPT;
        }
      }
    })
  ];
  return () => {
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }
  };
}
