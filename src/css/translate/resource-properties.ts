import { RESOURCES_TARGET, XAML_SEPARATOR } from "./property-kit.ts";
import type { PropertyGroup, WriteContext } from "./property-kit.ts";

// The dictionaries of the rules an element matches, merged into its own
// resources; the last merged wins a key, so they come lowest priority first.
function mergeResources({ native, control, value }: WriteContext) {
  const undos = value.split(XAML_SEPARATOR).map(xaml => native.mergeIntoControl(control, native.loadDictionary(xaml)));
  return () => {
    for (const undo of undos) {
      undo();
    }
  };
}

/**
 * What applies the custom properties a class declares to the elements that
 * have it. It holds no property: a sheet with such a rule registers it
 * (`registerPropertyGroups`), so a window whose sheets declare custom
 * properties on `:root` only carries none of it.
 */
export function resourceGroups() {
  return [{
    members: [],
    lower: () => [],
    writes: {
      [RESOURCES_TARGET]: mergeResources
    }
  } satisfies PropertyGroup];
}
