import { ElementEnvironment } from "./environment.ts";
import { provideEnvironment } from "./runtime.ts";
import type { PropertyGroup } from "#src/css/translate/property-kit.js";
import { systemMediaStore } from "#src/window/media-store.js";

/**
 * Gives the runtime the `@media` terms beyond the window's size
 * (preferences, display, input), answered from Windows' settings. It adds no
 * property: a sheet with such a query imports it.
 */
export function environmentGroups() {
  provideEnvironment(input => new ElementEnvironment({
    ...input,
    store: systemMediaStore()
  }));
  return [] satisfies PropertyGroup[];
}
