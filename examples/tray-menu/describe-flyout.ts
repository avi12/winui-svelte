import { projectAs } from "#winui/lifetime";
import type { MenuFlyout } from "#winui/microsoft/ui/xaml/controls/MenuFlyout";
import { MenuFlyoutItem } from "#winui/microsoft/ui/xaml/controls/MenuFlyoutItem";
import type { MenuFlyoutItemBase } from "#winui/microsoft/ui/xaml/controls/MenuFlyoutItemBase";
import { MenuFlyoutSeparator } from "#winui/microsoft/ui/xaml/controls/MenuFlyoutSeparator";
import { MenuFlyoutSubItem } from "#winui/microsoft/ui/xaml/controls/MenuFlyoutSubItem";
import { RadioMenuFlyoutItem } from "#winui/microsoft/ui/xaml/controls/RadioMenuFlyoutItem";
import { ToggleMenuFlyoutItem } from "#winui/microsoft/ui/xaml/controls/ToggleMenuFlyoutItem";

// The items of a flyout, as plain data a test can read: what the tray menu
// drew, by the class WinUI made and the members the model sets.

interface ItemVector {
  readonly size: number;
  getAt(index: number): MenuFlyoutItemBase;
}

interface ProjectedType<T extends object> {
  readonly prototype: T;
}

// The vector hands back the base class; a cast to a class the item is not throws.
function projectedOrNull<T extends object>({ item, type }: {
  item: MenuFlyoutItemBase;
  type: ProjectedType<T>;
}) {
  try {
    return projectAs(item, type);
  } catch {
    return null;
  }
}

function describeItem(item: MenuFlyoutItemBase) {
  const radio = projectedOrNull({
    item,
    type: RadioMenuFlyoutItem
  });
  const isRadio = radio !== null;
  if (isRadio) {
    return {
      type: "radio",
      text: radio.text,
      group: radio.groupName,
      isChecked: radio.isChecked,
      trailing: radio.keyboardAcceleratorTextOverride
    };
  }

  const toggle = projectedOrNull({
    item,
    type: ToggleMenuFlyoutItem
  });
  const isToggle = toggle !== null;
  if (isToggle) {
    return {
      type: "toggle",
      text: toggle.text,
      isChecked: toggle.isChecked,
      trailing: toggle.keyboardAcceleratorTextOverride
    };
  }

  const submenu = projectedOrNull({
    item,
    type: MenuFlyoutSubItem
  });
  const isSubmenu = submenu !== null;
  if (isSubmenu) {
    return {
      type: "submenu",
      text: submenu.text,
      items: describeItems(submenu.items)
    };
  }

  const command = projectedOrNull({
    item,
    type: MenuFlyoutItem
  });
  const isCommand = command !== null;
  if (isCommand) {
    return {
      type: "command",
      text: command.text,
      isEnabled: command.isEnabled,
      trailing: command.keyboardAcceleratorTextOverride,
      hasIcon: command.icon !== null
    };
  }

  const separator = projectedOrNull({
    item,
    type: MenuFlyoutSeparator
  });
  return { type: separator === null ? "unknown" : "separator" };
}

// eslint-disable-next-line no-restricted-syntax -- a recursive function needs its return type written
function describeItems(items: ItemVector | null): object[] {
  const described: object[] = [];
  const hasItems = items !== null;
  if (!hasItems) {
    return described;
  }

  for (let i = 0; i < items.size; i++) {
    described.push(describeItem(items.getAt(i)));
  }

  return described;
}

/**
 * The items of a `MenuFlyout` as plain data.
 *
 * @param flyout - The flyout the tray menu built.
 * @returns One object for each item, nested for a submenu.
 */
export function describeFlyout(flyout: MenuFlyout) {
  return describeItems(flyout.items);
}
