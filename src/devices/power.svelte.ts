import {
  Battery,
  BatteryStatus,
  EnergySaverStatus,
  PowerManager,
  PowerSupplyStatus
} from "./bindings.ts";
import type { Delivery } from "./delivery.ts";
import type { Subscription } from "./live.svelte.ts";
import { liveReader, subscriptionOfStaticEvent } from "./live.svelte.ts";

const TICKS_PER_MILLISECOND = 10_000n;
const UNKNOWN_DURATION = 9_223_372_036_854_775_807n;
const FULL_PERCENT = 100;

/** The power state of the machine at one moment. */
export interface PowerReading {
  readonly batteryStatus: BatteryStatus;

  /** 0 to 100; 100 on a machine with no battery. */
  readonly remainingChargePercent: number;
  readonly powerSupplyStatus: PowerSupplyStatus;
  readonly energySaverStatus: EnergySaverStatus;

  /** Null while Windows cannot estimate it (charging, or no battery). */
  readonly remainingDischargeMilliseconds: number | null;

  /** Positive while charging, negative while discharging; null without a battery or when the battery does not say. */
  readonly chargeRateMilliwatts: number | null;
  readonly designCapacityMilliwattHours: number | null;
  readonly fullChargeCapacityMilliwattHours: number | null;
  readonly remainingCapacityMilliwattHours: number | null;
}

/** The reads and events `battery` uses; a test stands in for them. */
export interface PowerSource {
  read(): PowerReading;
  subscriptions: readonly Subscription[];
}

/**
 * The power source over `Battery.AggregateBattery` and `PowerManager`.
 *
 * @returns Reads of the live power state, and the events that change it.
 */
export function windowsPowerSource() {
  const aggregate = Battery.aggregateBattery;
  return {
    read() {
      const report = aggregate.getReport();
      const remaining = PowerManager.remainingDischargeTime.duration;
      const isUnknown = remaining === UNKNOWN_DURATION;
      return {
        batteryStatus: PowerManager.batteryStatus,
        remainingChargePercent: PowerManager.remainingChargePercent,
        powerSupplyStatus: PowerManager.powerSupplyStatus,
        energySaverStatus: PowerManager.energySaverStatus,
        remainingDischargeMilliseconds: isUnknown ? null : Number(remaining / TICKS_PER_MILLISECOND),
        chargeRateMilliwatts: report.chargeRateInMilliwatts,
        designCapacityMilliwattHours: report.designCapacityInMilliwattHours,
        fullChargeCapacityMilliwattHours: report.fullChargeCapacityInMilliwattHours,
        remainingCapacityMilliwattHours: report.remainingCapacityInMilliwattHours
      };
    },
    subscriptions: [
      notify => aggregate.onReportUpdated(notify),
      subscriptionOfStaticEvent({
        add: handler => PowerManager.add_BatteryStatusChanged(handler),
        remove: token => PowerManager.remove_BatteryStatusChanged(token)
      }),
      subscriptionOfStaticEvent({
        add: handler => PowerManager.add_PowerSupplyStatusChanged(handler),
        remove: token => PowerManager.remove_PowerSupplyStatusChanged(token)
      }),
      subscriptionOfStaticEvent({
        add: handler => PowerManager.add_EnergySaverStatusChanged(handler),
        remove: token => PowerManager.remove_EnergySaverStatusChanged(token)
      }),
      subscriptionOfStaticEvent({
        add: handler => PowerManager.add_RemainingChargePercentChanged(handler),
        remove: token => PowerManager.remove_RemainingChargePercentChanged(token)
      }),
      subscriptionOfStaticEvent({
        add: handler => PowerManager.add_RemainingDischargeTimeChanged(handler),
        remove: token => PowerManager.remove_RemainingDischargeTimeChanged(token)
      })
    ]
  } satisfies PowerSource;
}

/** What `battery` takes. */
export interface BatteryOptions {
  /** Where the reads come from; the default is Windows. */
  readonly source?: PowerSource;

  /** How a change reaches the UI thread; the default runs on its dispatcher queue. */
  readonly deliver?: Delivery;
}

/**
 * The battery and power state, read live: charge, whether it is charging or on
 * AC power, the energy saver, and the battery's capacity. Every field is
 * reactive. A desktop with no battery reports `hasBattery` false and 100
 * percent; the capacity fields are then null.
 *
 * @param options - Where the reads come from, and how a change is delivered.
 * @returns The state as reactive getters, and `reading` as one object.
 */
export function battery(options: BatteryOptions = {}) {
  const source = options.source ?? windowsPowerSource();
  const read = liveReader({
    read: () => source.read(),
    subscriptions: source.subscriptions,
    deliver: options.deliver
  });
  return {
    get reading() {
      return read();
    },
    get hasBattery() {
      return read().batteryStatus !== BatteryStatus.NotPresent;
    },
    get percent() {
      return read().remainingChargePercent;
    },
    get isCharging() {
      return read().batteryStatus === BatteryStatus.Charging;
    },
    get isDischarging() {
      return read().batteryStatus === BatteryStatus.Discharging;
    },
    get isOnAcPower() {
      return read().powerSupplyStatus === PowerSupplyStatus.Adequate;
    },
    get isEnergySaverOn() {
      return read().energySaverStatus === EnergySaverStatus.On;
    },
    get remainingDischargeMilliseconds() {
      return read().remainingDischargeMilliseconds;
    },
    get healthPercent() {
      const { fullChargeCapacityMilliwattHours: full, designCapacityMilliwattHours: design } = read();
      const isKnown = full !== null && design !== null && design > 0;
      return isKnown ? Math.round(full / design * FULL_PERCENT) : null;
    }
  };
}
