import { isOnSurface } from "./context-menu-entry.ts";
import type { ContextMenuEntry } from "./context-menu-entry.ts";
import { ContextItemType } from "./context-menu-types.ts";
import type { ContextMenuSurface } from "./context-menu-types.ts";
import { MenuItemKind } from "#src/tray/menu/types.js";
import type { MenuItem } from "#src/tray/menu/types.js";

/** What `buildMenu` reads and calls back. */
export interface BuildMenuOptions {
  readonly entries: ReadonlyMap<string, ContextMenuEntry>;
  readonly surface: ContextMenuSurface;

  /** Runs the pick of an item. */
  readonly select: (id: string) => void;
}

/** The items under one parent (the top level for undefined), in the order they were made. */
export function childrenOf({ entries, parentId }: {
  entries: ReadonlyMap<string, ContextMenuEntry>;
  parentId: string | undefined;
}) {
  return entries.values().filter(entry => entry.parentId === parentId).toArray();
}

/** The consecutive radios of a sibling list that share a choice; a radio's group is its run. */
export function radioRunOf({ siblings, entry }: {
  siblings: readonly ContextMenuEntry[];
  entry: ContextMenuEntry;
}) {
  const position = siblings.indexOf(entry);
  let start = position;
  let end = position;
  while (siblings[start - 1]?.type === ContextItemType.RADIO) {
    start -= 1;
  }
  while (siblings[end + 1]?.type === ContextItemType.RADIO) {
    end += 1;
  }

  return siblings.slice(start, end + 1);
}

function radioGroupOf({ siblings, entry }: {
  siblings: readonly ContextMenuEntry[];
  entry: ContextMenuEntry;
}) {
  const [first] = radioRunOf({
    siblings,
    entry
  });
  return `${entry.parentId ?? ""}#${first?.id ?? entry.id}`;
}

/**
 * Makes the tray menu model of one surface from the stored items. A hidden item, and an item that did
 * not ask for the surface, is left out with its children.
 */
export function buildMenu({ entries, surface, select }: BuildMenuOptions) {
  function build(parentId: string | undefined) {
    const siblings = childrenOf({
      entries,
      parentId
    });
    const lines: MenuItem[] = [];
    for (const entry of siblings) {
      const isShown = entry.isVisible && isOnSurface({
        entry,
        surface
      });
      if (!isShown) {
        continue;
      }

      const common = {
        id: entry.id,
        label: entry.title,
        isEnabled: entry.isEnabled,
        onselect: () => select(entry.id)
      };
      const children = build(entry.id);
      const isSeparator = entry.type === ContextItemType.SEPARATOR;
      if (isSeparator) {
        lines.push({
          kind: MenuItemKind.SEPARATOR,
          id: entry.id
        });
      } else if (children.length > 0) {
        lines.push({
          ...common,
          kind: MenuItemKind.SUBMENU,
          items: children
        });
      } else if (entry.type === ContextItemType.CHECKBOX) {
        lines.push({
          ...common,
          kind: MenuItemKind.CHECK,
          isChecked: entry.isChecked
        });
      } else if (entry.type === ContextItemType.RADIO) {
        lines.push({
          ...common,
          kind: MenuItemKind.RADIO,
          group: radioGroupOf({
            siblings,
            entry
          }),
          isChecked: entry.isChecked
        });
      } else {
        lines.push({
          ...common,
          kind: MenuItemKind.COMMAND
        });
      }
    }

    return lines;
  }

  return build(undefined);
}
