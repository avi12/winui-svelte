import { projectAs } from "#winui/lifetime";
import type { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";
import { VisualTreeHelper } from "#winui/microsoft/ui/xaml/media/VisualTreeHelper";
import { UIElement } from "#winui/microsoft/ui/xaml/UIElement";

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
 * The element an element is in, or null when it is in none (an element that is
 * not in the tree). The visual tree gives a DependencyObject, which has no
 * element members, so it is projected as the UIElement it is; the projection is
 * the caller's to release (`releaseProjected`).
 */
export function parentElementOf(element: FrameworkElement) {
  const parent = VisualTreeHelper.getParent(element);
  const isRoot = parent === null || parent === undefined;
  return isRoot ? null : projectAs(parent, UIElement);
}
