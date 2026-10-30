import type { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";
import { ElementCompositionPreview } from "#winui/microsoft/ui/xaml/hosting/ElementCompositionPreview";
import { VisualTreeHelper } from "#winui/microsoft/ui/xaml/media/VisualTreeHelper";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";

// The members of FrameworkElement the effects use. A projected object is told by
// what it can do, not by `instanceof`: the control the CSS runtime hands over and the
// class this module imports need not be the same module instance.
const ELEMENT_METHODS = ["transformToVisual", "onLayoutUpdated", "onLoaded", "onUnloaded"];

/** Whether a value is a WinUI element (a FrameworkElement) of the visual tree. */
export function isFrameworkElement(value: unknown): value is FrameworkElement {
  const isObject = typeof value === "object" && value !== null;
  return isObject && ELEMENT_METHODS.every(method => method in value);
}

/**
 * The element an element is in, or null when it is in none (a window's content, or an
 * element that is not in the tree). The visual tree gives a DependencyObject, which has
 * no element members, so it is asked for its composition visual: the bindings pass it
 * on as the element it is, and it is no element when WinUI refuses.
 */
export function parentElementOf(element: FrameworkElement) {
  const parent = VisualTreeHelper.getParent(element);
  const isRoot = parent === null || parent === undefined;
  if (isRoot) {
    return null;
  }

  // oxlint-disable-next-line typescript/consistent-type-assertions -- the object behind it is the UIElement
  const candidate = parent as unknown as UIElement;
  try {
    ElementCompositionPreview.getElementVisual(candidate);
  } catch {
    return null;
  }

  return candidate;
}
