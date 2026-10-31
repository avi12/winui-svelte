import { HandlerEventTarget } from "./event-handlers.ts";
import { defineNavigatorProperty, defineProperty } from "./install.ts";
import { listenToSource } from "./source-events.ts";
import type { Delivery } from "#src/devices/delivery.js";
import type { NetworkReading, NetworkSource } from "#src/devices/network.js";
import { NetworkConnectivityLevel, NetworkCostType, windowsNetworkSource } from "#src/devices/network.js";

const MOBILE_BARS_FOR_THIRD_GENERATION = 2;
const MOBILE_BARS_FOR_FOURTH_GENERATION = 3;

/** The values of `NetworkInformation.effectiveType`. */
export const EffectiveConnectionType = {
  SLOW_2G: "slow-2g",
  TWO_G: "2g",
  THREE_G: "3g",
  FOUR_G: "4g"
} as const;
/** One of the values of `EffectiveConnectionType`. */
export type EffectiveConnectionType = (typeof EffectiveConnectionType)[keyof typeof EffectiveConnectionType];

/** The values of `NetworkInformation.type`. */
export const ConnectionType = {
  WIFI: "wifi",
  CELLULAR: "cellular",
  ETHERNET: "ethernet",
  NONE: "none",
  UNKNOWN: "unknown"
} as const;
/** One of the values of `ConnectionType`. */
export type ConnectionType = (typeof ConnectionType)[keyof typeof ConnectionType];

// Windows reports no throughput, so the round trip and bandwidth are the
// nominal figures of each effective type, as browsers publish them.
const ESTIMATES = new Map<EffectiveConnectionType, {
  readonly rtt: number;
  readonly downlink: number;
}>([
  [EffectiveConnectionType.SLOW_2G, {
    rtt: 2000,
    downlink: 0.05
  }],
  [EffectiveConnectionType.TWO_G, {
    rtt: 1400,
    downlink: 0.07
  }],
  [EffectiveConnectionType.THREE_G, {
    rtt: 400,
    downlink: 0.7
  }],
  [EffectiveConnectionType.FOUR_G, {
    rtt: 50,
    downlink: 10
  }]
]);

function isOnline(reading: NetworkReading) {
  return reading.connectivity === NetworkConnectivityLevel.InternetAccess;
}

function effectiveTypeOf(reading: NetworkReading) {
  if (!isOnline(reading)) {
    return EffectiveConnectionType.SLOW_2G;
  }

  const { signalBars } = reading;
  const hasBars = reading.isMobile && signalBars !== null;
  if (!hasBars) {
    return EffectiveConnectionType.FOUR_G;
  }

  const isFourthGeneration = signalBars >= MOBILE_BARS_FOR_FOURTH_GENERATION;
  if (isFourthGeneration) {
    return EffectiveConnectionType.FOUR_G;
  }

  const isThirdGeneration = signalBars >= MOBILE_BARS_FOR_THIRD_GENERATION;
  return isThirdGeneration ? EffectiveConnectionType.THREE_G : EffectiveConnectionType.TWO_G;
}

function typeOf(reading: NetworkReading) {
  if (!isOnline(reading)) {
    return ConnectionType.NONE;
  }

  if (reading.isWifi) {
    return ConnectionType.WIFI;
  }

  return reading.isMobile ? ConnectionType.CELLULAR : ConnectionType.ETHERNET;
}

function standardOf(reading: NetworkReading) {
  const effectiveType = effectiveTypeOf(reading);
  const estimate = ESTIMATES.get(effectiveType) ?? {
    rtt: 0,
    downlink: 0
  };
  const isMetered = reading.costType === NetworkCostType.Fixed || reading.costType === NetworkCostType.Variable;
  return {
    type: typeOf(reading),
    effectiveType,
    rtt: estimate.rtt,
    downlink: estimate.downlink,
    downlinkMax: estimate.downlink,
    saveData: isMetered
  };
}

/** The `navigator.connection` object. */
export class NetworkInformation extends HandlerEventTarget {
  private reading: NetworkReading;

  /** Made by `installNetwork`. */
  constructor(reading: NetworkReading) {
    super();
    this.reading = reading;
  }

  get type() {
    return standardOf(this.reading).type;
  }

  get effectiveType() {
    return standardOf(this.reading).effectiveType;
  }

  get rtt() {
    return standardOf(this.reading).rtt;
  }

  get downlink() {
    return standardOf(this.reading).downlink;
  }

  get downlinkMax() {
    return standardOf(this.reading).downlinkMax;
  }

  /** True on a metered connection (a fixed or variable cost in Windows). */
  get saveData() {
    return standardOf(this.reading).saveData;
  }

  /** How far the internet is reachable; `NetworkConnectivityLevel`. WinUI-only. */
  get connectivityLevel() {
    return this.reading.connectivity;
  }

  /** The connection's name, such as the Wi-Fi network; empty when disconnected. WinUI-only. */
  get profileName() {
    return this.reading.profileName;
  }

  /** The cost Windows puts on the connection: `NetworkCostType`. WinUI-only. */
  get costType() {
    return this.reading.costType;
  }

  /** Whether the connection is roaming. WinUI-only. */
  get isRoaming() {
    return this.reading.isRoaming;
  }

  /** Whether the data plan's limit is passed. WinUI-only. */
  get isOverDataLimit() {
    return this.reading.isOverDataLimit;
  }

  /** Whether the data plan's limit is near. WinUI-only. */
  get isApproachingDataLimit() {
    return this.reading.isApproachingDataLimit;
  }

  /** 0 to 5 bars, or null when the connection has no signal to show (wired). WinUI-only. */
  get signalBars() {
    return this.reading.signalBars;
  }

  /** Every connection Windows knows, connected or not. WinUI-only. */
  get profileNames() {
    return this.reading.profileNames;
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
   * Takes a fresh reading and fires `change` when a standard value moved.
   *
   * @param reading - The connection now.
   * @returns `online` or `offline` when the machine went that way, null when it did not.
   */
  update(reading: NetworkReading) {
    const before = standardOf(this.reading);
    const isPreviouslyOnline = isOnline(this.reading);
    this.reading = reading;
    const after = standardOf(reading);
    const hasChanged = JSON.stringify(before) !== JSON.stringify(after);
    if (hasChanged) {
      this.dispatchEvent(new Event("change"));
    }

    const isNowOnline = isOnline(reading);
    const hasFlipped = isNowOnline !== isPreviouslyOnline;
    if (!hasFlipped) {
      return null;
    }

    return isNowOnline ? "online" : "offline";
  }

  /** Whether the internet is reachable: what `navigator.onLine` reads. WinUI-only. */
  get isOnline() {
    return isOnline(this.reading);
  }

  get [Symbol.toStringTag]() {
    return "NetworkInformation";
  }
}

declare global {
  interface Navigator {
    /** The connection; defined by `installNetwork`. */
    readonly connection: NetworkInformation;
  }
}

/** What `installNetwork` takes. */
export interface NetworkInstallOptions {
  /** Where the reads come from; the default is Windows. */
  readonly source?: NetworkSource;

  /** How a change reaches the thread the app runs on; the default is the UI thread's dispatcher queue. */
  readonly deliver?: Delivery;
}

interface WindowEvents {
  readonly dispatch: (event: Event) => void;
  readonly uninstall: () => void;
}

// A runtime with no window gets just enough of one for `online` and `offline`;
// one that has an event target (another install defined it) is used as it is.
function windowEvents() {
  const hasEventTarget = typeof globalThis.dispatchEvent === "function";
  if (hasEventTarget) {
    return {
      dispatch: event => globalThis.dispatchEvent(event),
      uninstall() {}
    } satisfies WindowEvents;
  }

  const target = new HandlerEventTarget();
  const uninstalls = [
    defineProperty({
      name: "addEventListener",
      value: target.addEventListener.bind(target)
    }),
    defineProperty({
      name: "removeEventListener",
      value: target.removeEventListener.bind(target)
    }),
    defineProperty({
      name: "dispatchEvent",
      value: target.dispatchEvent.bind(target)
    })
  ];
  return {
    dispatch: event => target.dispatchEvent(event),
    uninstall() {
      for (const uninstall of uninstalls) {
        uninstall();
      }
    }
  } satisfies WindowEvents;
}

/**
 * Defines `navigator.connection`, `navigator.onLine` and the `online` and
 * `offline` events on the global scope, from `NetworkInformation`. The events
 * fire as Windows reports a change; listening ends on uninstall.
 *
 * @param options - Test stand-ins.
 * @returns The function that takes it away again.
 */
export function installNetwork(options: NetworkInstallOptions = {}) {
  const source = options.source ?? windowsNetworkSource();
  const connection = new NetworkInformation(source.read());
  const events = windowEvents();
  const stop = listenToSource({
    subscriptions: source.subscriptions,
    onChange() {
      const change = connection.update(source.read());
      if (change) {
        events.dispatch(new Event(change));
      }
    },
    ...options.deliver === undefined ? {} : { deliver: options.deliver }
  });
  const uninstallConnection = defineNavigatorProperty({
    name: "connection",
    value: connection
  });
  const previousOnLine = Object.getOwnPropertyDescriptor(navigator, "onLine");
  Object.defineProperty(navigator, "onLine", {
    get: () => connection.isOnline,
    configurable: true,
    enumerable: false
  });
  const uninstallClass = defineProperty({
    name: "NetworkInformation",
    value: NetworkInformation
  });
  return () => {
    uninstallClass();

    const hasNativeOnLine = previousOnLine !== undefined;
    if (hasNativeOnLine) {
      Object.defineProperty(navigator, "onLine", previousOnLine);
    } else {
      // eslint-disable-next-line no-restricted-syntax -- the one typed way to delete a property of any object
      Reflect.deleteProperty(navigator, "onLine");
    }

    uninstallConnection();
    stop();
    events.uninstall();
  };
}
