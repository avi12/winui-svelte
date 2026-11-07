import type {
  TrayMenuHeaderProps,
  TrayMenuItemProps,
  TrayMenuSeparatorProps,
  TrayMenuSubmenuProps
} from "./menu-props.ts";
import { MenuItemKind } from "#src/tray/menu/types.js";
import type {
  MenuCheckItem,
  MenuCommandItem,
  MenuHeaderItem,
  MenuRadioItem,
  MenuSeparatorItem,
  MenuSubmenuItem
} from "#src/tray/menu/types.js";

// A markup component draws nothing: it is an inert element (the renderer
// keeps it in the tree and ignores its attributes, which Svelte would
// stringify), and it writes its typed spec here from an attachment, so that
// booleans and functions arrive as themselves. collect.ts reads the specs back
// in tree order.

/** What a component declares about itself: a line of the model, and for a submenu the line without its children. */
export type MenuNodeSpec =
  | MenuCommandItem
  | MenuCheckItem
  | MenuRadioItem
  | MenuSeparatorItem
  | MenuHeaderItem
  | Omit<MenuSubmenuItem, "items">;

const specs = new WeakMap<object, MenuNodeSpec>();

/**
 * The attachment that records a component's spec on its element, again whenever a prop the spec reads changes.
 *
 * @param spec - Reads the component's props into its spec.
 * @returns The attachment for an inert element.
 */
export function menuNode(spec: () => MenuNodeSpec) {
  return (node: object) => {
    specs.set(node, spec());
    return () => {
      specs.delete(node);
    };
  };
}

/**
 * The spec an element recorded.
 *
 * @param node - An element of the tree.
 * @returns Its spec, or undefined for an element that is no menu component.
 */
export function specOf(node: object) {
  return specs.get(node);
}

/**
 * The spec of a `TrayMenuItem`.
 *
 * @param props - Its props.
 * @returns The command, check or radio line they declare.
 */
export function itemSpec(props: TrayMenuItemProps) {
  const isCheck = props.kind === MenuItemKind.CHECK;
  if (isCheck) {
    return { ...props } satisfies MenuCheckItem;
  }

  const isRadio = props.kind === MenuItemKind.RADIO;
  if (isRadio) {
    return { ...props } satisfies MenuRadioItem;
  }

  return {
    ...props,
    kind: MenuItemKind.COMMAND
  } satisfies MenuCommandItem;
}

/**
 * The spec of a `TrayMenuSubmenu`.
 *
 * @param props - Its props.
 * @returns The submenu line they declare, without its children.
 */
export function submenuSpec({ children: _children, ...fields }: TrayMenuSubmenuProps) {
  return {
    ...fields,
    kind: MenuItemKind.SUBMENU
  } satisfies Omit<MenuSubmenuItem, "items">;
}

/**
 * The spec of a `TrayMenuSeparator`.
 *
 * @param props - Its props.
 * @returns The separator line they declare.
 */
export function separatorSpec(props: TrayMenuSeparatorProps) {
  return {
    ...props,
    kind: MenuItemKind.SEPARATOR
  } satisfies MenuSeparatorItem;
}

/**
 * The spec of a `TrayMenuHeader`.
 *
 * @param props - Its props.
 * @returns The header line they declare.
 */
export function headerSpec(props: TrayMenuHeaderProps) {
  return {
    ...props,
    kind: MenuItemKind.HEADER
  } satisfies MenuHeaderItem;
}
