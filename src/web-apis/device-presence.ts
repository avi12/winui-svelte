/**
 * Tells when devices of a kind come and go, from a listing and a "something
 * changed" signal: the listing is read again on each signal and compared with
 * the one before. The first listing is taken silently, so only devices that
 * arrive or leave after `start` are reported.
 *
 * @param options - How to list, how to hear of a change, and what to do about each arrival and departure.
 * @returns `start`, which begins watching once (calling it again does nothing), and `stop`.
 */
export function createDevicePresence<T extends { readonly id: string }>({ list, subscribe, onAdded, onRemoved }: {
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
