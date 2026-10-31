import { HandlerEventTarget } from "./event-handlers.ts";

/**
 * Tells when devices of a kind come and go, from a listing and a "something
 * changed" signal: the listing is read again on each signal and compared with
 * the one before. The first listing is taken silently, so only devices that
 * arrive or leave after `start` are reported.
 *
 * @param options - How to list, how to hear of a change, and what to do about each arrival and departure.
 * @returns `start`, which begins watching once (calling it again does nothing), and `stop`.
 */
function createDevicePresence<T extends { readonly id: string }>({ list, subscribe, onAdded, onRemoved }: {
  list: () => Promise<readonly T[]>;
  subscribe: (onChange: () => void) => () => void;
  onAdded: (device: T) => void;
  onRemoved: (device: T) => void;
}) {
  let known = new Map<string, T>();
  let stopWatching: (() => void) | undefined;
  let ready: Promise<void> = Promise.resolve();
  async function refresh() {
    await ready;
    const now = new Map((await list()).map(device => [device.id, device]));
    const before = known;
    known = now;
    for (const [id, device] of now) {
      if (!before.has(id)) {
        onAdded(device);
      }
    }

    for (const [id, device] of before) {
      if (!now.has(id)) {
        onRemoved(device);
      }
    }
  }

  return {
    start() {
      const isStarted = stopWatching !== undefined;
      if (isStarted) {
        return;
      }

      ready = list().then(devices => {
        known = new Map(devices.map(device => [device.id, device]));
      });
      stopWatching = subscribe(() => {
        void refresh();
      });
    },
    stop() {
      stopWatching?.();
      stopWatching = undefined;
    }
  };
}

/**
 * An `EventTarget` (`navigator.usb`, `navigator.hid`) that fires
 * `connect` and `disconnect`. It watches the system only once something
 * listens, and stops when told.
 */
export class DevicePresenceTarget<T extends { readonly id: string }> extends HandlerEventTarget {
  private readonly presence;

  /** Made by the API that extends this. */
  constructor({ list, subscribe, onAdded, onRemoved }: {
    list: () => Promise<readonly T[]>;
    subscribe: (onChange: () => void) => () => void;

    /** The `connect` event to fire for an arrival, or nothing to stay quiet. */
    onAdded: (device: T) => Event | undefined;

    /** The `disconnect` event to fire for a departure, or nothing to stay quiet. */
    onRemoved: (device: T) => Event | undefined;
  }) {
    super();
    this.presence = createDevicePresence({
      list,
      subscribe,
      onAdded: device => {
        const event = onAdded(device);
        const hasEvent = event !== undefined;
        if (hasEvent) {
          this.dispatchEvent(event);
        }
      },
      onRemoved: device => {
        const event = onRemoved(device);
        const hasEvent = event !== undefined;
        if (hasEvent) {
          this.dispatchEvent(event);
        }
      }
    });
  }

  // fallow-ignore-next-line unused-class-member
  get onconnect() {
    return this.getHandler("connect");
  }

  // fallow-ignore-next-line unused-class-member
  set onconnect(handler: EventListener | null) {
    this.setHandler({
      type: "connect",
      handler
    });
  }

  // fallow-ignore-next-line unused-class-member
  get ondisconnect() {
    return this.getHandler("disconnect");
  }

  // fallow-ignore-next-line unused-class-member
  set ondisconnect(handler: EventListener | null) {
    this.setHandler({
      type: "disconnect",
      handler
    });
  }

  // eslint-disable-next-line no-restricted-syntax -- the signature EventTarget has
  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean
  ) {
    this.presence.start();
    super.addEventListener(type, callback, options);
  }

  /** Stops watching for devices; used when the API is uninstalled. */
  stopWatching() {
    this.presence.stop();
  }
}
