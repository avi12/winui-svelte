import { DomErrorName, domException } from "./dom-exception.ts";
import { HandlerEventTarget } from "./event-handlers.ts";
import { defineNavigatorProperty, defineProperty } from "./install.ts";
import { listenToSource } from "./source-events.ts";
import type { Delivery } from "#src/devices/delivery.js";
import type { PowerReading, PowerSource } from "#src/devices/power.js";
import { BatteryStatus, EnergySaverStatus, PowerSupplyStatus, windowsPowerSource } from "#src/devices/power.js";

const PERCENT = 100;
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_HOUR = 3600;

interface BatteryState {
  readonly charging: boolean;
  readonly chargingTime: number;
  readonly dischargingTime: number;
  readonly level: number;
}

function isCharging(reading: PowerReading) {
  const isPresent = reading.batteryStatus !== BatteryStatus.NotPresent;
  const isFilling = reading.batteryStatus === BatteryStatus.Charging;
  const isPluggedIn = reading.powerSupplyStatus === PowerSupplyStatus.Adequate;
  return !isPresent || isFilling || isPluggedIn;
}

function secondsToFull(reading: PowerReading) {
  const {
    fullChargeCapacityMilliwattHours: full,
    remainingCapacityMilliwattHours: left,
    chargeRateMilliwatts: rate
  } = reading;
  const isFull = reading.remainingChargePercent >= PERCENT;
  if (isFull) {
    return 0;
  }

  const isKnown = full !== null && left !== null && rate !== null && rate > 0;
  return isKnown ? Math.round((full - left) / rate * SECONDS_PER_HOUR) : Infinity;
}

function stateOf(reading: PowerReading) {
  const isFilling = isCharging(reading) && reading.batteryStatus !== BatteryStatus.NotPresent;
  const isUnplugged = !isCharging(reading);
  const remaining = reading.remainingDischargeMilliseconds;
  const isDischargeKnown = isUnplugged && remaining !== null;
  return {
    charging: isCharging(reading),
    chargingTime: isFilling ? secondsToFull(reading) : Infinity,
    dischargingTime: isDischargeKnown ? Math.round(remaining / MILLISECONDS_PER_SECOND) : Infinity,
    level: reading.remainingChargePercent / PERCENT
  } satisfies BatteryState;
}

declare global {
  interface Navigator {
    /** The battery state, as a `BatteryManager`; defined by `installBattery`. */
    getBattery(): Promise<BatteryManager>;
  }
}

/** The `BatteryManager` that `navigator.getBattery()` resolves to. */
export class BatteryManager extends HandlerEventTarget {
  private reading: PowerReading;

  /** Made by `navigator.getBattery`. */
  constructor(reading: PowerReading) {
    super();
    this.reading = reading;
  }

  get charging() {
    return stateOf(this.reading).charging;
  }

  get chargingTime() {
    return stateOf(this.reading).chargingTime;
  }

  get dischargingTime() {
    return stateOf(this.reading).dischargingTime;
  }

  get level() {
    return stateOf(this.reading).level;
  }

  /** Whether the machine has a battery at all; a desktop reports 100 percent and charging. WinUI-only. */
  get hasBattery() {
    return this.reading.batteryStatus !== BatteryStatus.NotPresent;
  }

  /** Whether the Windows battery saver is on. WinUI-only. */
  get isEnergySaverOn() {
    return this.reading.energySaverStatus === EnergySaverStatus.On;
  }

  /** Positive while charging, negative while discharging, in milliwatts; null when unknown. WinUI-only. */
  get chargeRateMilliwatts() {
    return this.reading.chargeRateMilliwatts;
  }

  /** What the battery was built to hold, in milliwatt-hours; null when unknown. WinUI-only. */
  get designCapacityMilliwattHours() {
    return this.reading.designCapacityMilliwattHours;
  }

  /** What it holds when full now, in milliwatt-hours; null when unknown. WinUI-only. */
  get fullChargeCapacityMilliwattHours() {
    return this.reading.fullChargeCapacityMilliwattHours;
  }

  /** What it holds now, in milliwatt-hours; null when unknown. WinUI-only. */
  get remainingCapacityMilliwattHours() {
    return this.reading.remainingCapacityMilliwattHours;
  }

  get onchargingchange() {
    return this.getHandler("chargingchange");
  }

  set onchargingchange(handler: EventListener | null) {
    this.setHandler({
      type: "chargingchange",
      handler
    });
  }

  get onchargingtimechange() {
    return this.getHandler("chargingtimechange");
  }

  set onchargingtimechange(handler: EventListener | null) {
    this.setHandler({
      type: "chargingtimechange",
      handler
    });
  }

  get ondischargingtimechange() {
    return this.getHandler("dischargingtimechange");
  }

  set ondischargingtimechange(handler: EventListener | null) {
    this.setHandler({
      type: "dischargingtimechange",
      handler
    });
  }

  get onlevelchange() {
    return this.getHandler("levelchange");
  }

  set onlevelchange(handler: EventListener | null) {
    this.setHandler({
      type: "levelchange",
      handler
    });
  }

  /**
   * Takes a fresh reading and fires the standard events for what changed.
   *
   * @param reading - The power state now.
   */
  update(reading: PowerReading) {
    const before = stateOf(this.reading);
    this.reading = reading;
    const after = stateOf(reading);
    const changed = [
      {
        type: "chargingchange",
        hasChanged: before.charging !== after.charging
      },
      {
        type: "chargingtimechange",
        hasChanged: before.chargingTime !== after.chargingTime
      },
      {
        type: "dischargingtimechange",
        hasChanged: before.dischargingTime !== after.dischargingTime
      },
      {
        type: "levelchange",
        hasChanged: before.level !== after.level
      }
    ];
    for (const { type, hasChanged } of changed) {
      if (hasChanged) {
        this.dispatchEvent(new Event(type));
      }
    }
  }

  get [Symbol.toStringTag]() {
    return "BatteryManager";
  }
}

/** What `installBattery` takes. */
export interface BatteryInstallOptions {
  /** Where the reads come from; the default is Windows. */
  readonly source?: PowerSource;

  /** How a change reaches the thread the app runs on; the default is the UI thread's dispatcher queue. */
  readonly deliver?: Delivery;
}

/**
 * Defines `navigator.getBattery()` and `BatteryManager`. Windows is read
 * and listened to only once `getBattery()` is first called, and the
 * listening ends on uninstall.
 *
 * @param options - Test stand-ins.
 * @returns The function that takes it away again.
 */
export function installBattery(options: BatteryInstallOptions = {}) {
  const source = options.source ?? windowsPowerSource();
  let manager: BatteryManager | undefined;
  let stop: (() => void) | undefined;
  function getBattery() {
    try {
      manager ??= start();
      return Promise.resolve(manager);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Promise.reject(
        domException({
          name: DomErrorName.NOT_SUPPORTED,
          message
        })
      );
    }
  }
  const uninstallMethod = defineNavigatorProperty({
    name: "getBattery",
    value: getBattery
  });
  const uninstallClass = defineProperty({
    name: "BatteryManager",
    value: BatteryManager
  });
  function start() {
    const created = new BatteryManager(source.read());
    stop = listenToSource({
      subscriptions: source.subscriptions,
      onChange: () => created.update(source.read()),
      ...options.deliver === undefined ? {} : { deliver: options.deliver }
    });
    return created;
  }

  return () => {
    stop?.();
    manager = undefined;
    uninstallMethod();
    uninstallClass();
  };
}
