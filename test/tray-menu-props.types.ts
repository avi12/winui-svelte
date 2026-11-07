import { MenuLevel } from "#src/enums.js";
import type {
  TrayMenuHeaderProps,
  TrayMenuItemProps,
  TrayMenuSeparatorProps,
  TrayMenuSubmenuProps
} from "#src/tray/menu-svelte/index.js";
import { defaultProfile, defineMenu } from "#src/tray/menu/index.js";
import type { MenuProfile } from "#src/tray/menu/index.js";
import TrayIcon from "#src/tray/TrayIcon.svelte";
import type { ComponentInternals, Snippet } from "svelte";

// Never run: `pnpm check` (tsc) reads it. The tray menu components take the
// model's own fields and nothing else: each line under `@ts-expect-error` is
// refused, and the check fails if one were accepted. (svelte-check does not
// honour that directive in markup, so these are the props objects.)

const open: TrayMenuItemProps = {
  id: "open",
  label: "Open",
  level: MenuLevel.STANDARD
};
const check: TrayMenuItemProps = {
  kind: "check",
  id: "auto",
  label: "Autostart",
  isChecked: true
};
const radio: TrayMenuItemProps = {
  kind: "radio",
  id: "fast",
  label: "Fast",
  group: "mode"
};
const unknownField: TrayMenuItemProps = {
  id: "a",
  label: "A",
  // @ts-expect-error an attribute the model has no field for
  color: "red"
};
// @ts-expect-error a command has no tick
const commandWithTick: TrayMenuItemProps = {
  id: "b",
  label: "B",
  isChecked: true
};
// @ts-expect-error a radio line names its group
const radioWithoutGroup: TrayMenuItemProps = {
  kind: "radio",
  id: "c",
  label: "C"
};
const wrongBoolean: TrayMenuItemProps = {
  id: "d",
  label: "D",
  // @ts-expect-error isEnabled is a boolean or a function that gives one
  isEnabled: "yes"
};
const wrongLevel: TrayMenuItemProps = {
  id: "e",
  label: "E",
  // @ts-expect-error a level is one of the closed set
  level: "huge"
};

const separator: TrayMenuSeparatorProps = { id: "divider" };
const labelledSeparator: TrayMenuSeparatorProps = {
  id: "f",
  // @ts-expect-error a separator has no label
  label: "F"
};
const header: TrayMenuHeaderProps = {
  id: "title",
  label: "Recorder"
};
declare const children: Snippet;
const itemsSubmenu: TrayMenuSubmenuProps = {
  id: "g",
  label: "G",
  // @ts-expect-error a submenu's lines are its children, not an items prop
  items: [],
  children
};

// The ids of a model menu reach `profile`: a profile that names another id is refused.
declare const internals: ComponentInternals;
const items = defineMenu([{
  kind: "command",
  id: "open",
  label: "Open"
}]);
const stranger: MenuProfile<"stranger"> = defaultProfile();
TrayIcon(internals, {
  icon: "a.ico",
  menu: items,
  profile: defaultProfile()
});
TrayIcon(internals, {
  icon: "a.ico",
  menu: items,
  // @ts-expect-error the profile names an id the menu does not have
  profile: stranger
});

export const proofs = [
  open,
  check,
  radio,
  unknownField,
  commandWithTick,
  radioWithoutGroup,
  wrongBoolean,
  wrongLevel,
  separator,
  labelledSeparator,
  header,
  itemsSubmenu
];
