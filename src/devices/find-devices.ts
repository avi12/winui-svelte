import { DeviceInformation } from "./bindings.ts";
import type { DeviceQuery } from "./device-query.ts";
import { resolvedQuery } from "./device-query.ts";
import { snapshotOf } from "./device-snapshot.ts";

/**
 * Lists the devices a query matches, once (WinRT's
 * `DeviceInformation.FindAllAsync`).
 *
 * @param options - What to list (`selector`, `deviceClass` or `kind`, and the
 *   `requestedProperties` to read), and a `signal` that cancels the search.
 * @returns A snapshot of each device found; empty when none match.
 */
export async function findAllDevices(options: DeviceQuery & { readonly signal?: AbortSignal } = {}) {
  const { selector, kind, requestedProperties } = resolvedQuery(options);
  const found = await DeviceInformation.findAllAsync(selector, [...requestedProperties], kind, options.signal);
  return [...found].map(information => snapshotOf({
    information,
    requestedProperties
  }));
}
