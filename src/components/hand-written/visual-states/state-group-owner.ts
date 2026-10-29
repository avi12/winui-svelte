import type { StateGroupList } from "./state-group-list.ts";
import { VisualStateManager } from "#src/components/generated/bindings.js";
import type { FrameworkElement, VisualStateGroup } from "#src/components/generated/bindings.js";
import type { PlacedControl } from "#src/components/runtime.js";

// Only a FrameworkElement has visual state groups; every one has a margin.
function isFrameworkElement(value: object | null): value is FrameworkElement {
  return value !== null && "margin" in value;
}

/**
 * Fills the visual state groups of the element a list sits in with the
 * groups the list holds, as they come and go.
 *
 * @returns What takes the list's groups out of the element again.
 * @throws {Error} When the list is not in an element.
 */
export function bindStateGroups({ control, parent }: PlacedControl<StateGroupList<VisualStateGroup>>) {
  const element = parent();
  if (!isFrameworkElement(element)) {
    throw new Error("VisualStateGroups must be inside a FrameworkElement, a Grid for one");
  }

  const collection = VisualStateManager.getVisualStateGroups(element);
  const hasCollection = collection !== null;
  if (!hasCollection) {
    throw new Error("the element has no visual state groups to fill");
  }

  control.bind(collection);
  return () => control.release();
}
