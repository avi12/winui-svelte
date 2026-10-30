import { Accelerometer, Inclinometer, LightSensor } from "./bindings.ts";
import type { Delivery } from "./delivery.ts";
import type { Subscription } from "./live.svelte.ts";
import { liveTracker } from "./live.svelte.ts";

/** The part of a WinRT sensor that is read; a test stands in for it. */
export interface SensorLike<Reading> {
  getCurrentReading(): Reading | null;
  onReadingChanged(callback: () => void): () => void;
}

/** What a sensor rune takes. */
export interface SensorOptions<Sensor> {
  /** The sensor; the default is the machine's (`getDefault()`), which is null when it has none. */
  readonly sensor?: Sensor | null;

  /** How a change reaches the UI thread; the default runs on its dispatcher queue. */
  readonly deliver?: Delivery;
}

function liveReading<Reading, Value>({ sensor, deliver, convert }: {
  sensor: SensorLike<Reading> | null;
  deliver: Delivery | undefined;
  convert: (reading: Reading) => Value;
}) {
  const subscriptions: Subscription[] = sensor === null ? [] : [notify => sensor.onReadingChanged(notify)];
  const track = liveTracker({
    subscriptions,
    ...deliver === undefined ? {} : { deliver }
  });
  return {
    get isAvailable() {
      return sensor !== null;
    },
    get reading() {
      track();
      const reading = sensor?.getCurrentReading();
      return reading == null ? null : convert(reading);
    }
  };
}

/** The ambient light. */
export interface LightReading {
  readonly lux: number;
}

/** What an accelerometer measures. */
export interface AccelerationReading {
  /** Acceleration in g along each axis. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The tilt of the device in degrees. */
export interface InclinationReading {
  readonly pitchDegrees: number;
  readonly rollDegrees: number;
  readonly yawDegrees: number;
}

/**
 * The ambient light sensor. Most desktops have none: `isAvailable` is then
 * false and `reading` null. Laptops and tablets report lux.
 *
 * @param options - The sensor to read, and how a change is delivered.
 * @returns `isAvailable` and the reactive `reading`.
 */
export function lightSensor(options: SensorOptions<SensorLike<{ illuminanceInLux: number }>> = {}) {
  return liveReading({
    sensor: options.sensor === undefined ? LightSensor.getDefault() : options.sensor,
    deliver: options.deliver,
    convert: reading => ({ lux: reading.illuminanceInLux } satisfies LightReading)
  });
}

/**
 * The accelerometer. Most desktops have none: `isAvailable` is then false and
 * `reading` null.
 *
 * @param options - The sensor to read, and how a change is delivered.
 * @returns `isAvailable` and the reactive `reading`.
 */
export function accelerometer(options: SensorOptions<SensorLike<{
  accelerationX: number;
  accelerationY: number;
  accelerationZ: number;
}>> = {}) {
  return liveReading({
    sensor: options.sensor === undefined ? Accelerometer.getDefault() : options.sensor,
    deliver: options.deliver,
    convert: reading => ({
      x: reading.accelerationX,
      y: reading.accelerationY,
      z: reading.accelerationZ
    } satisfies AccelerationReading)
  });
}

/**
 * The inclinometer (pitch, roll and yaw). Most desktops have none:
 * `isAvailable` is then false and `reading` null.
 *
 * @param options - The sensor to read, and how a change is delivered.
 * @returns `isAvailable` and the reactive `reading`.
 */
export function inclinometer(options: SensorOptions<SensorLike<{
  pitchDegrees: number;
  rollDegrees: number;
  yawDegrees: number;
}>> = {}) {
  return liveReading({
    sensor: options.sensor === undefined ? Inclinometer.getDefault() : options.sensor,
    deliver: options.deliver,
    convert: reading => ({
      pitchDegrees: reading.pitchDegrees,
      rollDegrees: reading.rollDegrees,
      yawDegrees: reading.yawDegrees
    } satisfies InclinationReading)
  });
}
