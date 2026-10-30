import type { PropertyGroup } from "./property-kit.ts";
import { ElementQueries } from "#src/css/runtime/queries.js";
import { provideQueries } from "#src/css/runtime/runtime.js";

/**
 * Gives the runtime `@media`, `@container` and `@starting-style`. It adds no
 * property: a sheet that has such a rule imports it, and with it the code that
 * watches the window, the containers and the element's first layout.
 */
export function queryGroups() {
  provideQueries(input => new ElementQueries(input));
  return [] satisfies PropertyGroup[];
}
