import { Radio, RadioAccessStatus, RadioKind, RadioState } from "./bindings.ts";
import type { Delivery } from "./delivery.ts";
import { defaultDelivery } from "./delivery.ts";
import { deviceChanges } from "./device-changes.ts";
import type { DeviceChangesOptions } from "./device-changes.ts";
import { errorOf } from "./errors.ts";
import { stopWhenDone } from "./scope.svelte.ts";

/** One radio of the machine (`Radio`): Wi-Fi, Bluetooth, mobile broadband, FM. */
export interface RadioSnapshot {
  readonly name: string;
  readonly kind: RadioKind;
  readonly state: RadioState;
}

/** The part of WinRT's `Radio` that is read; a test stands in for it. */
export interface RadioLike extends RadioSnapshot {
  onStateChanged(callback: () => void): () => void;
}

/**
 * Asks Windows whether the app may use the radios (`Radio.RequestAccessAsync`).
 * Reading them needs none; turning one on or off does, and the user can deny
 * it in Settings, Privacy.
 *
 * @returns Whether access is allowed, denied by the user or denied by the system.
 */
export function requestRadioAccess() {
  return Radio.requestAccessAsync();
}

/**
 * Turns a radio on or off (`Radio.SetStateAsync`). This changes the machine's
 * radio, so it is never done by a rune.
 *
 * @param options - The radio and the state to set.
 * @throws {Error} When Windows does not allow it.
 */
export async function setRadioState({ radio, state }: {
  radio: Radio;
  state: RadioState;
}) {
  const access = await radio.setStateAsync(state);
  const isDenied = access !== RadioAccessStatus.Allowed;
  if (isDenied) {
    throw new Error(`the radio ${radio.name} cannot be changed: access status ${access}`);
  }
}

/**
 * Lists the radios once.
 *
 * @param options - A `signal`.
 * @returns A snapshot of each radio.
 */
export async function getRadios({ signal }: { signal?: AbortSignal } = {}) {
  const radios = await Radio.getRadiosAsync(signal);
  return [...radios ?? []].map(radio => ({
    name: radio.name,
    kind: radio.kind,
    state: radio.state
  } satisfies RadioSnapshot));
}

/** What `radios` takes. */
export interface RadiosOptions {
  /** Ends the watching when it aborts. */
  readonly signal?: AbortSignal;

  /** How a change reaches the UI thread; the default runs on its dispatcher queue. */
  readonly deliver?: Delivery;

  /** Lists the radios; the default is WinRT's `Radio.GetRadiosAsync`. */
  readonly list?: () => Promise<readonly RadioLike[]>;

  /** Makes the watcher of radios coming and going; a test stands in for it. */
  readonly createSource?: DeviceChangesOptions["createSource"];
}

async function listRadios() {
  return [...await Radio.getRadiosAsync() ?? []];
}

/**
 * The radios of the machine, live: each one's name, kind and state, updated
 * when the user flips Wi-Fi or Bluetooth in Settings or a radio is plugged in.
 * Starts at once and stops with the component or `signal`.
 *
 * @param options - How to list the radios and deliver changes.
 * @returns `radios` (a snapshot each), the first of each kind (`bluetooth`,
 *   `wifi`), `isBluetoothOn`, `isWifiOn`, `isLoaded`, `error` and `stop`.
 */
export function radios(options: RadiosOptions = {}) {
  const deliver = options.deliver ?? defaultDelivery();
  const list = options.list ?? listRadios;
  const state = $state<{
    radios: readonly RadioSnapshot[];
    isLoaded: boolean;
    error: Error | null;
  }>({
    radios: [],
    isLoaded: false,
    error: null
  });
  let isStopped = false;
  let unsubscribeStates: Array<() => void> = [];

  async function load() {
    const found = await list();
    if (isStopped) {
      return;
    }

    for (const unsubscribe of unsubscribeStates) {
      unsubscribe();
    }

    unsubscribeStates = found.map(radio => radio.onStateChanged(refresh));
    deliver(() => {
      state.radios = found.map(radio => ({
        name: radio.name,
        kind: radio.kind,
        state: radio.state
      }));
      state.isLoaded = true;
      state.error = null;
    });
  }

  function refresh() {
    load().catch(thrown => deliver(() => {
      state.error = errorOf(thrown);
    }));
  }

  const unsubscribeChanges = deviceChanges({
    selector: Radio.getDeviceSelector(),
    ...options.createSource === undefined ? {} : { createSource: options.createSource }
  })(refresh);
  refresh();

  function stop() {
    isStopped = true;
    unsubscribeChanges();
    for (const unsubscribe of unsubscribeStates) {
      unsubscribe();
    }

    unsubscribeStates = [];
  }

  stopWhenDone({
    stop,
    signal: options.signal
  });
  function stateOf(kind: RadioKind) {
    return state.radios.find(radio => radio.kind === kind);
  }
  return {
    get radios() {
      return state.radios;
    },
    get bluetooth() {
      return stateOf(RadioKind.Bluetooth);
    },
    get wifi() {
      return stateOf(RadioKind.WiFi);
    },
    get isBluetoothOn() {
      return stateOf(RadioKind.Bluetooth)?.state === RadioState.On;
    },
    get isWifiOn() {
      return stateOf(RadioKind.WiFi)?.state === RadioState.On;
    },
    get isLoaded() {
      return state.isLoaded;
    },
    get error() {
      return state.error;
    },
    stop
  };
}
