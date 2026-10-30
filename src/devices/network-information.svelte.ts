import { NetworkConnectivityLevel, NetworkCostType, NetworkInformation } from "./bindings.ts";
import type { Delivery } from "./delivery.ts";
import type { Subscription } from "./live.svelte.ts";
import { liveTracker, subscriptionOfStaticEvent } from "./live.svelte.ts";

/** The connection the internet is reached by, at one moment. */
export interface NetworkReading {
  readonly connectivity: NetworkConnectivityLevel;

  /** The connection name (the Wi-Fi network, "Ethernet"); empty when disconnected. */
  readonly profileName: string;
  readonly costType: NetworkCostType;
  readonly isRoaming: boolean;
  readonly isOverDataLimit: boolean;
  readonly isApproachingDataLimit: boolean;
  readonly isWifi: boolean;
  readonly isMobile: boolean;

  /** 0 to 5 bars, or null when the connection has no signal to show (wired). */
  readonly signalBars: number | null;

  /** Every connection Windows knows, connected or not. */
  readonly profileNames: readonly string[];
}

/** The reads and events `networkInformation` uses; a test stands in for them. */
export interface NetworkSource {
  read(): NetworkReading;
  subscriptions: readonly Subscription[];
}

const DISCONNECTED = {
  connectivity: NetworkConnectivityLevel.None,
  profileName: "",
  costType: NetworkCostType.Unknown,
  isRoaming: false,
  isOverDataLimit: false,
  isApproachingDataLimit: false,
  isWifi: false,
  isMobile: false,
  signalBars: null
} as const;

/**
 * The network source over `NetworkInformation`.
 *
 * @returns Reads of the internet connection profile, and its status event.
 */
export function windowsNetworkSource() {
  return {
    read() {
      const profileNames = [...NetworkInformation.getConnectionProfiles() ?? []].map(profile => profile.profileName);
      const profile = NetworkInformation.getInternetConnectionProfile();
      const isDisconnected = profile == null;
      if (isDisconnected) {
        return {
          ...DISCONNECTED,
          profileNames
        };
      }

      const cost = profile.getConnectionCost();
      return {
        connectivity: profile.getNetworkConnectivityLevel(),
        profileName: profile.profileName,
        costType: cost.networkCostType,
        isRoaming: cost.roaming,
        isOverDataLimit: cost.overDataLimit,
        isApproachingDataLimit: cost.approachingDataLimit,
        isWifi: profile.isWlanConnectionProfile,
        isMobile: profile.isWwanConnectionProfile,
        signalBars: profile.getSignalBars(),
        profileNames
      };
    },
    subscriptions: [
      subscriptionOfStaticEvent({
        add: handler => NetworkInformation.add_NetworkStatusChanged(handler),
        remove: token => NetworkInformation.remove_NetworkStatusChanged(token)
      })
    ]
  } satisfies NetworkSource;
}

/** What `networkInformation` takes. */
export interface NetworkInformationOptions {
  /** Where the reads come from; the default is Windows. */
  readonly source?: NetworkSource;

  /** How a change reaches the UI thread; the default runs on its dispatcher queue. */
  readonly deliver?: Delivery;
}

/**
 * The network connection, read live: whether the internet is reachable, the
 * connection name, whether it is metered or roaming, and the signal. Every
 * field is reactive and follows `NetworkInformation.NetworkStatusChanged`.
 *
 * @param options - Where the reads come from, and how a change is delivered.
 * @returns The state as reactive getters, and `reading` as one object.
 */
export function networkInformation(options: NetworkInformationOptions = {}) {
  const source = options.source ?? windowsNetworkSource();
  const track = liveTracker({
    subscriptions: source.subscriptions,
    ...options.deliver === undefined ? {} : { deliver: options.deliver }
  });
  function read() {
    track();
    return source.read();
  }
  return {
    get reading() {
      return read();
    },
    get connectivity() {
      return read().connectivity;
    },
    get isOnline() {
      return read().connectivity === NetworkConnectivityLevel.InternetAccess;
    },
    get profileName() {
      return read().profileName;
    },
    get isMetered() {
      const { costType } = read();
      return costType === NetworkCostType.Fixed || costType === NetworkCostType.Variable;
    },
    get isRoaming() {
      return read().isRoaming;
    },
    get isWifi() {
      return read().isWifi;
    },
    get isMobile() {
      return read().isMobile;
    },
    get signalBars() {
      return read().signalBars;
    }
  };
}
