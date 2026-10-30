import { DeviceInformation, DeviceWatcherStatus } from "./bindings.ts";
import type { ResolvedDeviceQuery } from "./device-query.ts";
import type { DeviceInformationLike, DeviceUpdateLike } from "./device-snapshot.ts";

/**
 * The part of WinRT's `DeviceWatcher` that `deviceWatcher` and
 * `deviceChanges` use; a test stands in for it.
 */
export interface DeviceWatcherSource {
  readonly status: DeviceWatcherStatus;
  start(): void;
  stop(): void;
  onAdded(callback: (sender: unknown, information: DeviceInformationLike) => void): () => void;
  onUpdated(callback: (sender: unknown, update: DeviceUpdateLike) => void): () => void;
  onRemoved(callback: (sender: unknown, update: DeviceUpdateLike) => void): () => void;
  onEnumerationCompleted(callback: () => void): () => void;
  onStopped(callback: () => void): () => void;
}

/**
 * Makes WinRT's own watcher for a query: the source `deviceWatcher` and
 * `deviceChanges` use unless a test passes another.
 *
 * @param query - The resolved query.
 * @returns A `DeviceWatcher`, not started.
 */
export function createDeviceWatcherSource({ selector, requestedProperties, kind }: ResolvedDeviceQuery) {
  return DeviceInformation.createWatcher(selector, [...requestedProperties], kind);
}

/**
 * Whether a watcher in this status is running and so has to be stopped.
 *
 * @param status - A watcher's status.
 * @returns True for Started and EnumerationCompleted.
 */
export function isWatcherRunning(status: DeviceWatcherStatus) {
  return status === DeviceWatcherStatus.Started || status === DeviceWatcherStatus.EnumerationCompleted;
}
