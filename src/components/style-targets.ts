// The element a Style prop styles. WinUI's metadata types these props Style and
// says nothing of the TargetType the Style needs, which a CSS class cannot
// guess: the rules that match, the properties that are valid and the default
// style it builds on all depend on it. By prop; where the element depends on
// the control that holds the prop (an ItemsControl's containers), by the
// control's class name and the prop. The element is named as the tag the CSS
// runtime knows it by.

const STYLE_TARGETS = new Map<string, string>([
  ["actionButtonStyle", "button"],
  ["calendarViewDayItemStyle", "calendar-view-day-item"],
  ["calendarViewStyle", "calendar-view"],
  ["closeButtonStyle", "button"],
  ["commandBarOverflowPresenterStyle", "command-bar-overflow-presenter"],
  ["flyoutPresenterStyle", "flyout-presenter"],
  ["menuFlyoutPresenterStyle", "menu-flyout-presenter"],
  ["menuItemContainerStyle", "navigation-view-item"],
  ["nextButtonStyle", "button"],
  ["normalPipStyle", "button"],
  ["paneToggleButtonStyle", "button"],
  ["previousButtonStyle", "button"],
  ["primaryButtonStyle", "button"],
  ["secondaryButtonStyle", "button"],
  ["selectedPipStyle", "button"],
  ["subMenuItemStyle", "menu-flyout-item"],
  ["subMenuPresenterStyle", "menu-flyout-presenter"],
  ["textBoxStyle", "text-box"],
  ["ComboBox.itemContainerStyle", "combo-box-item"],
  ["FlipView.itemContainerStyle", "flip-view-item"],
  ["GridView.itemContainerStyle", "grid-view-item"],
  ["ItemsControl.itemContainerStyle", "content-presenter"],
  ["ListView.itemContainerStyle", "list-view-item"],
  ["TreeView.itemContainerStyle", "tree-view-item"]
]);

const OWNER_SEPARATOR = ".";

/** Whether a Style prop (by name) has an element it styles, on its own or on some control. */
export function hasStyleTarget(property: string) {
  const isOwnTarget = STYLE_TARGETS.has(property);
  return isOwnTarget || [...STYLE_TARGETS.keys()].some(key => key.endsWith(`${OWNER_SEPARATOR}${property}`));
}

/**
 * The element type (a tag such as `list-view-item`) a Style prop styles on the
 * control of this class.
 *
 * @throws {Error} When the prop's element is not known for that control.
 */
export function styleTarget({ property, owner }: {
  property: string;
  owner: string;
}) {
  const target = STYLE_TARGETS.get(`${owner}${OWNER_SEPARATOR}${property}`) ?? STYLE_TARGETS.get(property);
  const isKnown = target !== undefined;
  if (!isKnown) {
    throw new Error(`${owner}.${property} takes a Style object: no CSS class is known for the element it styles`);
  }

  return target;
}
