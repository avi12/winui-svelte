import { DomErrorName } from "./dom-exception.ts";
import { HandlerEventTarget } from "./event-handlers.ts";
import { defineProperty } from "./install.ts";
import { PermissionName, PermissionStateName, registerPermission } from "./permissions.ts";
import { listenToSource } from "./source-events.ts";
import type { Delivery } from "#src/devices/delivery.js";
import type { SensorLike } from "#src/devices/sensors.js";
import { Accelerometer as NativeAccelerometer } from "#winui/windows/devices/sensors/Accelerometer";
import { Altimeter as NativeAltimeter } from "#winui/windows/devices/sensors/Altimeter";
import { Barometer as NativeBarometer } from "#winui/windows/devices/sensors/Barometer";
import { Compass as NativeCompass } from "#winui/windows/devices/sensors/Compass";
import { Gyrometer } from "#winui/windows/devices/sensors/Gyrometer";
import { LightSensor } from "#winui/windows/devices/sensors/LightSensor";
import { Magnetometer as NativeMagnetometer } from "#winui/windows/devices/sensors/Magnetometer";
import { OrientationSensor } from "#winui/windows/devices/sensors/OrientationSensor";
import { SensorReadingType } from "#winui/windows/devices/sensors/SensorReadingType";

const STANDARD_GRAVITY = 9.80665;
const HALF_TURN_DEGREES = 180;
const RADIANS_PER_DEGREE = Math.PI / HALF_TURN_DEGREES;
const MILLISECONDS_PER_SECOND = 1000;
const MATRIX_SIZE = 16;

/** The sensors this module offers; the last three are not in the Generic Sensor API and are WinUI-only. */
export const SensorKind = {
  ACCELEROMETER: "accelerometer",
  GYROSCOPE: "gyroscope",
  MAGNETOMETER: "magnetometer",
  ABSOLUTE_ORIENTATION: "absolute-orientation",
  RELATIVE_ORIENTATION: "relative-orientation",
  AMBIENT_LIGHT: "ambient-light",
  BAROMETER: "barometer",
  ALTIMETER: "altimeter",
  COMPASS: "compass"
} as const;
/** One of the values of `SensorKind`. */
export type SensorKind = (typeof SensorKind)[keyof typeof SensorKind];

/** A reading along three axes. */
export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A rotation: a quaternion `[x, y, z, w]` and the 3 by 3 matrix, row by row. */
export interface OrientationValue {
  readonly quaternion: readonly [number, number, number, number];
  readonly matrix: readonly number[];
  readonly yawAccuracy: number;
}

/** What each kind of sensor reads, in the units of the Generic Sensor API. */
export interface SensorValues {
  readonly accelerometer: Vector3;
  readonly gyroscope: Vector3;
  readonly magnetometer: Vector3 & { readonly accuracy: number };
  readonly "absolute-orientation": OrientationValue;
  readonly "relative-orientation": OrientationValue;
  readonly "ambient-light": { readonly illuminance: number };
  readonly barometer: { readonly pressure: number };
  readonly altimeter: { readonly altitude: number };
  readonly compass: {
    readonly magneticNorth: number;
    readonly trueNorth: number | null;
    readonly accuracy: number;
  };
}

/** One open sensor, already in standard units. */
export interface SensorChannel<Value> {
  read(): Value | null;
  listen(notify: () => void): () => void;
  setIntervalMilliseconds(milliseconds: number): void;
}

/** Stands between the sensor classes and Windows; the tests give their own. */
export interface SensorBackend {
  isAvailable(kind: SensorKind): boolean;
  open<Kind extends SensorKind>(kind: Kind): SensorChannel<SensorValues[Kind]> | null;
}

/** The part of a WinRT sensor that the channels use, over `SensorLike` from `src/devices`. */
export interface NativeSensor<Reading> extends SensorLike<Reading> {
  readonly minimumReportInterval: number;
  reportInterval: number;
}

interface OrientationReading {
  readonly quaternion: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
  readonly rotationMatrix: {
    readonly m11: number;
    readonly m12: number;
    readonly m13: number;
    readonly m21: number;
    readonly m22: number;
    readonly m23: number;
    readonly m31: number;
    readonly m32: number;
    readonly m33: number;
  };
  readonly yawAccuracy: unknown;
}

/** The WinRT sensors the Windows backend reads; a test gives its own to check the conversions. */
export interface WindowsSensors {
  readonly accelerometer: () => NativeSensor<{
    accelerationX: number;
    accelerationY: number;
    accelerationZ: number;
  }> | null;
  readonly gyroscope: () => NativeSensor<{
    angularVelocityX: number;
    angularVelocityY: number;
    angularVelocityZ: number;
  }> | null;
  readonly magnetometer: () => NativeSensor<{
    magneticFieldX: number;
    magneticFieldY: number;
    magneticFieldZ: number;
    directionalAccuracy: unknown;
  }> | null;
  readonly absoluteOrientation: () => NativeSensor<OrientationReading> | null;
  readonly relativeOrientation: () => NativeSensor<OrientationReading> | null;
  readonly ambientLight: () => NativeSensor<{ illuminanceInLux: number }> | null;
  readonly barometer: () => NativeSensor<{
    stationPressureInHectopascals: number;
  }> | null;
  readonly altimeter: () => NativeSensor<{
    altitudeChangeInMeters: number;
  }> | null;
  readonly compass: () => NativeSensor<{
    headingMagneticNorth: number;
    headingTrueNorth: number | null;
    headingAccuracy: unknown;
  }> | null;
}

function channelOf<Reading, Value>({ native, convert }: {
  native: NativeSensor<Reading>;
  convert: (reading: Reading) => Value;
}) {
  return {
    read() {
      const reading = native.getCurrentReading();
      return reading == null ? null : convert(reading);
    },
    listen: notify => native.onReadingChanged(notify),
    setIntervalMilliseconds(milliseconds) {
      native.reportInterval = Math.max(milliseconds, native.minimumReportInterval);
    }
  } satisfies SensorChannel<Value>;
}

function numberOrZero(value: unknown) {
  return typeof value === "number" ? value : 0;
}

function orientationOf(reading: OrientationReading) {
  const { quaternion, rotationMatrix: matrix } = reading;
  return {
    quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
    matrix: [
      matrix.m11,
      matrix.m12,
      matrix.m13,
      matrix.m21,
      matrix.m22,
      matrix.m23,
      matrix.m31,
      matrix.m32,
      matrix.m33
    ],
    yawAccuracy: numberOrZero(reading.yawAccuracy)
  } satisfies OrientationValue;
}

function nativeSensors() {
  return {
    accelerometer: () => NativeAccelerometer.getDefault(),
    gyroscope: () => Gyrometer.getDefault(),
    magnetometer: () => NativeMagnetometer.getDefault(),
    absoluteOrientation: () => OrientationSensor.getDefault(SensorReadingType.Absolute),
    relativeOrientation: () => OrientationSensor.getDefault(SensorReadingType.Relative),
    ambientLight: () => LightSensor.getDefault(),
    barometer: () => NativeBarometer.getDefault(),
    altimeter: () => NativeAltimeter.getDefault(),
    compass: () => NativeCompass.getDefault()
  } satisfies WindowsSensors;
}

/**
 * The backend over `Windows.Devices.Sensors`. Most desktops have none of
 * these; a kind the machine lacks is not available and its class is not
 * defined.
 *
 * @param sensors - Where the WinRT sensors come from; the machine's by default.
 * @returns A backend for `installSensors`.
 */
export function windowsSensorBackend(sensors: WindowsSensors = nativeSensors()) {
  /* eslint-disable @typescript-eslint/naming-convention -- the kinds are the Generic Sensor API's own names */
  const openers: { [Kind in SensorKind]: () => SensorChannel<SensorValues[Kind]> | null } = {
    "accelerometer"() {
      const native = sensors.accelerometer();
      return native && channelOf({
        native,
        convert: reading => ({
          x: reading.accelerationX * STANDARD_GRAVITY,
          y: reading.accelerationY * STANDARD_GRAVITY,
          z: reading.accelerationZ * STANDARD_GRAVITY
        })
      });
    },
    "gyroscope"() {
      const native = sensors.gyroscope();
      return native && channelOf({
        native,
        convert: reading => ({
          x: reading.angularVelocityX * RADIANS_PER_DEGREE,
          y: reading.angularVelocityY * RADIANS_PER_DEGREE,
          z: reading.angularVelocityZ * RADIANS_PER_DEGREE
        })
      });
    },
    "magnetometer"() {
      const native = sensors.magnetometer();
      return native && channelOf({
        native,
        convert: reading => ({
          x: reading.magneticFieldX,
          y: reading.magneticFieldY,
          z: reading.magneticFieldZ,
          accuracy: numberOrZero(reading.directionalAccuracy)
        })
      });
    },
    "absolute-orientation"() {
      const native = sensors.absoluteOrientation();
      return native && channelOf({
        native,
        convert: orientationOf
      });
    },
    "relative-orientation"() {
      const native = sensors.relativeOrientation();
      return native && channelOf({
        native,
        convert: orientationOf
      });
    },
    "ambient-light"() {
      const native = sensors.ambientLight();
      return native && channelOf({
        native,
        convert: reading => ({ illuminance: reading.illuminanceInLux })
      });
    },
    "barometer"() {
      const native = sensors.barometer();
      return native && channelOf({
        native,
        convert: reading => ({ pressure: reading.stationPressureInHectopascals })
      });
    },
    "altimeter"() {
      const native = sensors.altimeter();
      return native && channelOf({
        native,
        convert: reading => ({ altitude: reading.altitudeChangeInMeters })
      });
    },
    "compass"() {
      const native = sensors.compass();
      return native && channelOf({
        native,
        convert: reading => ({
          magneticNorth: reading.headingMagneticNorth,
          trueNorth: reading.headingTrueNorth,
          accuracy: numberOrZero(reading.headingAccuracy)
        })
      });
    }
  };
  /* eslint-enable @typescript-eslint/naming-convention */
  return {
    isAvailable(kind) {
      return openers[kind]() !== null;
    },
    open: kind => openers[kind]()
  } satisfies SensorBackend;
}

/** The options of a sensor's constructor. */
export interface SensorOptions {
  /** How many readings a second are wanted; the sensor's own minimum interval is the limit. */
  readonly frequency?: number;
  readonly referenceFrame?: "device" | "screen";
}

/** Fired on a sensor's `error` event. */
export class SensorErrorEvent extends Event {
  readonly error: DOMException;

  /** Made by a sensor. */
  constructor(type: string, init: { error: DOMException }) {
    super(type);
    this.error = init.error;
  }
}

interface SensorContext {
  readonly backend: SensorBackend;
  readonly deliver: Delivery | undefined;
}

let context: SensorContext | undefined;

function requireContext() {
  if (!context) {
    throw new DOMException("Sensors are not installed: call installSensors() first", "InvalidStateError");
  }

  return context;
}

/** The base of the sensor classes: `start`, `stop`, `activated`, `hasReading`, `timestamp` and the events. */
export class Sensor<Kind extends SensorKind = SensorKind> extends HandlerEventTarget {
  private readonly kind: Kind;
  private readonly frequency: number | undefined;
  private channel: SensorChannel<SensorValues[Kind]> | undefined;
  private stopListening: (() => void) | undefined;
  private latest: SensorValues[Kind] | null = null;
  private isActive = false;
  private readingTime: number | null = null;

  /** Made by the sensor classes. */
  constructor({ kind, options }: {
    kind: Kind;
    options: SensorOptions | undefined;
  }) {
    super();
    this.kind = kind;
    this.frequency = options?.frequency;
  }

  get activated() {
    return this.isActive;
  }

  get hasReading() {
    return this.latest !== null;
  }

  get timestamp() {
    return this.readingTime;
  }

  /** The last reading in the units of the Generic Sensor API; subclasses expose it as `x`, `illuminance` and so on. */
  protected get value() {
    return this.latest;
  }

  /** Starts reading: `activate`, then `reading` on each reading; `error` when the machine lacks the sensor. */
  start() {
    if (this.isActive) {
      return;
    }

    const { backend, deliver } = requireContext();
    const channel = backend.open(this.kind);
    const isMissing = channel === null;
    if (isMissing) {
      queueMicrotask(() => this.fail("The sensor is not available on this machine"));
      return;
    }

    this.channel = channel;
    this.isActive = true;
    const hasFrequency = this.frequency !== undefined && this.frequency > 0;
    if (hasFrequency) {
      channel.setIntervalMilliseconds(MILLISECONDS_PER_SECOND / (this.frequency ?? 1));
    }

    this.stopListening = listenToSource({
      subscriptions: [notify => channel.listen(notify)],
      onChange: () => this.take(),
      ...deliver === undefined ? {} : { deliver }
    });
    this.dispatchEvent(new Event("activate"));
    this.take();
  }

  /** Stops reading; the last reading is forgotten. */
  stop() {
    this.stopListening?.();
    this.stopListening = undefined;
    this.channel = undefined;
    this.isActive = false;
    this.latest = null;
    this.readingTime = null;
  }

  get onreading() {
    return this.getHandler("reading");
  }

  set onreading(handler: EventListener | null) {
    this.setHandler({
      type: "reading",
      handler
    });
  }

  get onerror() {
    return this.getHandler("error");
  }

  set onerror(handler: EventListener | null) {
    this.setHandler({
      type: "error",
      handler
    });
  }

  get onactivate() {
    return this.getHandler("activate");
  }

  set onactivate(handler: EventListener | null) {
    this.setHandler({
      type: "activate",
      handler
    });
  }

  private take() {
    const value = this.channel?.read() ?? null;
    if (!value) {
      return;
    }

    this.latest = value;
    this.readingTime = performance.now();
    this.dispatchEvent(new Event("reading"));
  }

  private fail(message: string) {
    this.dispatchEvent(new SensorErrorEvent("error", { error: new DOMException(message, DomErrorName.NOT_READABLE) }));
  }
}

/** `x`, `y` and `z` of a sensor that reads along three axes. */
class AxisSensor<Kind extends "accelerometer" | "gyroscope" | "magnetometer"> extends Sensor<Kind> {
  get x() {
    return this.value?.x ?? null;
  }

  get y() {
    return this.value?.y ?? null;
  }

  // oxlint-disable-next-line eslint/id-length -- the standard member name
  get z() {
    return this.value?.z ?? null;
  }
}

/** Acceleration along each axis in meters per second squared, gravity included. */
export class Accelerometer extends AxisSensor<"accelerometer"> {
  /** Made by the app. */
  constructor(options?: SensorOptions) {
    super({
      kind: SensorKind.ACCELEROMETER,
      options
    });
  }

  get [Symbol.toStringTag]() {
    return "Accelerometer";
  }
}

/** Rotation speed around each axis in radians per second. */
export class Gyroscope extends AxisSensor<"gyroscope"> {
  /** Made by the app. */
  constructor(options?: SensorOptions) {
    super({
      kind: SensorKind.GYROSCOPE,
      options
    });
  }

  get [Symbol.toStringTag]() {
    return "Gyroscope";
  }
}

/** The magnetic field along each axis in microtesla. */
export class Magnetometer extends AxisSensor<"magnetometer"> {
  /** Made by the app. */
  constructor(options?: SensorOptions) {
    super({
      kind: SensorKind.MAGNETOMETER,
      options
    });
  }

  /** How far to trust the reading, as `MagnetometerAccuracy`. WinUI-only. */
  get accuracy() {
    return this.value?.accuracy ?? null;
  }

  get [Symbol.toStringTag]() {
    return "Magnetometer";
  }
}

/** The quaternion and rotation matrix of the device. */
class OrientationBase<Kind extends "absolute-orientation" | "relative-orientation"> extends Sensor<Kind> {
  /** The rotation as `[x, y, z, w]`, or null before a reading. */
  get quaternion() {
    return this.value?.quaternion ?? null;
  }

  /** How far to trust the heading, as `MagnetometerAccuracy`. WinUI-only. */
  get yawAccuracy() {
    return this.value?.yawAccuracy ?? null;
  }

  /**
   * Writes the rotation as a 4 by 4 column-major matrix.
   *
   * @param target - A `Float32Array`, `Float64Array` or `DOMMatrix` of 16 entries.
   * @throws {TypeError} When the target is not 16 entries long.
   * @throws {DOMException} `NotReadableError` before a reading.
   */
  populateMatrix(target: Float32Array | Float64Array) {
    const isWrongSize = target.length !== MATRIX_SIZE;
    if (isWrongSize) {
      throw new TypeError("The target must have 16 entries");
    }

    const matrix = this.value?.matrix;
    if (!matrix) {
      throw new DOMException("The sensor has no reading yet", DomErrorName.NOT_READABLE);
    }

    const [m11 = 0, m12 = 0, m13 = 0, m21 = 0, m22 = 0, m23 = 0, m31 = 0, m32 = 0, m33 = 0] = matrix;
    target.set([m11, m21, m31, 0, m12, m22, m32, 0, m13, m23, m33, 0, 0, 0, 0, 1]);
  }
}

/** The device's rotation relative to the Earth's magnetic north and gravity. */
export class AbsoluteOrientationSensor extends OrientationBase<"absolute-orientation"> {
  /** Made by the app. */
  constructor(options?: SensorOptions) {
    super({
      kind: SensorKind.ABSOLUTE_ORIENTATION,
      options
    });
  }

  get [Symbol.toStringTag]() {
    return "AbsoluteOrientationSensor";
  }
}

/** The device's rotation relative to where it started, with no compass. */
export class RelativeOrientationSensor extends OrientationBase<"relative-orientation"> {
  /** Made by the app. */
  constructor(options?: SensorOptions) {
    super({
      kind: SensorKind.RELATIVE_ORIENTATION,
      options
    });
  }

  get [Symbol.toStringTag]() {
    return "RelativeOrientationSensor";
  }
}

/** The light around the device in lux. */
export class AmbientLightSensor extends Sensor<"ambient-light"> {
  /** Made by the app. */
  constructor(options?: SensorOptions) {
    super({
      kind: SensorKind.AMBIENT_LIGHT,
      options
    });
  }

  get illuminance() {
    return this.value?.illuminance ?? null;
  }

  get [Symbol.toStringTag]() {
    return "AmbientLightSensor";
  }
}

/** Air pressure in hectopascals. WinUI-only: the Generic Sensor API has no barometer. */
export class Barometer extends Sensor<"barometer"> {
  /** Made by the app. */
  constructor(options?: SensorOptions) {
    super({
      kind: SensorKind.BAROMETER,
      options
    });
  }

  get pressure() {
    return this.value?.pressure ?? null;
  }

  get [Symbol.toStringTag]() {
    return "Barometer";
  }
}

/** The change of altitude in meters since the sensor started. WinUI-only. */
export class Altimeter extends Sensor<"altimeter"> {
  /** Made by the app. */
  constructor(options?: SensorOptions) {
    super({
      kind: SensorKind.ALTIMETER,
      options
    });
  }

  get altitude() {
    return this.value?.altitude ?? null;
  }

  get [Symbol.toStringTag]() {
    return "Altimeter";
  }
}

/** The compass heading in degrees. WinUI-only. */
export class Compass extends Sensor<"compass"> {
  /** Made by the app. */
  constructor(options?: SensorOptions) {
    super({
      kind: SensorKind.COMPASS,
      options
    });
  }

  get headingMagneticNorth() {
    return this.value?.magneticNorth ?? null;
  }

  get headingTrueNorth() {
    return this.value?.trueNorth ?? null;
  }

  get accuracy() {
    return this.value?.accuracy ?? null;
  }

  get [Symbol.toStringTag]() {
    return "Compass";
  }
}

/** What `installSensors` takes. */
export interface SensorsInstallOptions {
  /** Stands in for Windows; the tests give one. */
  readonly backend?: SensorBackend;

  /** How a reading reaches the thread the app runs on; the default is the UI thread's dispatcher queue. */
  readonly deliver?: Delivery;
}

const CLASSES = [
  [SensorKind.ACCELEROMETER, "Accelerometer", Accelerometer],
  [SensorKind.GYROSCOPE, "Gyroscope", Gyroscope],
  [SensorKind.MAGNETOMETER, "Magnetometer", Magnetometer],
  [SensorKind.ABSOLUTE_ORIENTATION, "AbsoluteOrientationSensor", AbsoluteOrientationSensor],
  [SensorKind.RELATIVE_ORIENTATION, "RelativeOrientationSensor", RelativeOrientationSensor],
  [SensorKind.AMBIENT_LIGHT, "AmbientLightSensor", AmbientLightSensor],
  [SensorKind.BAROMETER, "Barometer", Barometer],
  [SensorKind.ALTIMETER, "Altimeter", Altimeter],
  [SensorKind.COMPASS, "Compass", Compass]
] as const;

const PERMISSIONS = [
  [SensorKind.ACCELEROMETER, PermissionName.ACCELEROMETER],
  [SensorKind.GYROSCOPE, PermissionName.GYROSCOPE],
  [SensorKind.MAGNETOMETER, PermissionName.MAGNETOMETER],
  [SensorKind.AMBIENT_LIGHT, PermissionName.AMBIENT_LIGHT_SENSOR]
] as const;

/**
 * Defines the Generic Sensor classes for the sensors the machine has, and
 * `Sensor` with them. A kind the machine lacks gets no class, so feature
 * detection (`"Accelerometer" in globalThis`) works as in a browser. The
 * Permissions API answers `accelerometer`, `gyroscope`, `magnetometer` and
 * `ambient-light-sensor`: granted where the sensor exists, denied where not.
 *
 * @param options - Test stand-ins.
 * @returns The function that takes it away again.
 */
export function installSensors(options: SensorsInstallOptions = {}) {
  const backend = options.backend ?? windowsSensorBackend();
  const previous = context;
  context = {
    backend,
    deliver: options.deliver
  };
  const uninstalls = [
    defineProperty({
      name: "Sensor",
      value: Sensor
    }),
    ...CLASSES.filter(([kind]) => backend.isAvailable(kind)).map(([, name, value]) => defineProperty({
      name,
      value
    })),
    ...PERMISSIONS.map(([kind, name]) => {
      const state = backend.isAvailable(kind) ? PermissionStateName.GRANTED : PermissionStateName.DENIED;
      return registerPermission({
        name,
        provider: {
          state: () => state
        }
      });
    })
  ];
  return () => {
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }

    context = previous;
  };
}
