import { DeviceInformationKind, DeviceWatcherStatus } from "#src/devices/bindings.js";
import type { DeviceInformationLike, DeviceUpdateLike, PropertyBag } from "#src/devices/device-snapshot.js";
import type { DeviceWatcherSource } from "#src/devices/device-watcher-source.js";

/** The property the fake devices carry. */
export const SIGNAL_NAME = "System.Devices.Aep.SignalStrength";

/** A stand-in for a DeviceInformation with one property. */
export class FakeInformation implements DeviceInformationLike {
  readonly kind = DeviceInformationKind.DeviceInterface;
  isEnabled = true;
  readonly isDefault = false;
  readonly pairing = null;
  private readonly values = new Map<string, unknown>();

  readonly id: string;
  readonly name: string;

  constructor({ id, name, signal }: {
    id: string;
    name: string;
    signal: number;
  }) {
    this.id = id;
    this.name = name;
    this.values.set(SIGNAL_NAME, signal);
  }

  get properties() {
    return {
      get: (key: string) => this.values.get(key),
      has: (key: string) => this.values.has(key)
    } satisfies PropertyBag;
  }

  update(update: DeviceUpdateLike) {
    const signal = update.properties?.get(SIGNAL_NAME);
    this.values.set(SIGNAL_NAME, signal);
  }
}

/** A stand-in for the WinRT DeviceWatcher that a test drives by hand. */
export class FakeWatcher implements DeviceWatcherSource {
  status: DeviceWatcherStatus = DeviceWatcherStatus.Created;
  startCount = 0;
  stopCount = 0;
  startError: Error | null = null;
  private readonly handlers = {
    added: new Set<(sender: unknown, information: DeviceInformationLike) => void>(),
    updated: new Set<(sender: unknown, update: DeviceUpdateLike) => void>(),
    removed: new Set<(sender: unknown, update: DeviceUpdateLike) => void>(),
    completed: new Set<() => void>(),
    stopped: new Set<() => void>()
  };

  get handlerCount() {
    let total = 0;
    for (const set of Object.values(this.handlers)) {
      total += set.size;
    }

    return total;
  }

  start() {
    this.startCount++;

    const { startError } = this;
    const hasStartError = startError !== null;
    if (hasStartError) {
      throw startError;
    }

    this.status = DeviceWatcherStatus.Started;
  }

  stop() {
    this.stopCount++;
    this.status = DeviceWatcherStatus.Stopped;
  }

  onAdded(callback: (sender: unknown, information: DeviceInformationLike) => void) {
    return this.listen({
      set: this.handlers.added,
      handler: callback
    });
  }

  onUpdated(callback: (sender: unknown, update: DeviceUpdateLike) => void) {
    return this.listen({
      set: this.handlers.updated,
      handler: callback
    });
  }

  onRemoved(callback: (sender: unknown, update: DeviceUpdateLike) => void) {
    return this.listen({
      set: this.handlers.removed,
      handler: callback
    });
  }

  onEnumerationCompleted(callback: () => void) {
    return this.listen({
      set: this.handlers.completed,
      handler: callback
    });
  }

  onStopped(callback: () => void) {
    return this.listen({
      set: this.handlers.stopped,
      handler: callback
    });
  }

  add(information: FakeInformation) {
    for (const handler of this.handlers.added) {
      handler(this, information);
    }
  }

  update({ id, signal }: {
    id: string;
    signal: number;
  }) {
    const update = {
      id,
      kind: DeviceInformationKind.DeviceInterface,
      properties: {
        get: () => signal,
        has: () => true
      }
    };
    for (const handler of this.handlers.updated) {
      handler(this, update);
    }
  }

  remove(id: string) {
    for (const handler of this.handlers.removed) {
      handler(this, {
        id,
        kind: DeviceInformationKind.DeviceInterface,
        properties: null
      });
    }
  }

  completeEnumeration() {
    this.status = DeviceWatcherStatus.EnumerationCompleted;
    for (const handler of this.handlers.completed) {
      handler();
    }
  }

  abort() {
    this.status = DeviceWatcherStatus.Aborted;
    for (const handler of this.handlers.stopped) {
      handler();
    }
  }

  private listen<Handler>({ set, handler }: {
    set: Set<Handler>;
    handler: Handler;
  }) {
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }
}
