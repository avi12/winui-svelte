import { resolveMenu } from "#src/tray/menu/resolve.js";
import { MenuItemKind } from "#src/tray/menu/types.js";
import type { MenuItem, MenuProfile, ResolvedMenuItem } from "#src/tray/menu/types.js";

const SEPARATOR_TEXT = "-----";

interface PreviewLine {
  readonly id: string;
  readonly text: string;

  /** How many submenus hold the line; 0 at the root. */
  readonly depth: number;
}

function linesOf({ entries, depth }: {
  readonly entries: readonly ResolvedMenuItem[];
  readonly depth: number;
}): PreviewLine[] {
  return entries.flatMap(entry => {
    const isSeparator = entry.kind === MenuItemKind.SEPARATOR;
    const text = isSeparator ? SEPARATOR_TEXT : entry.label;
    const own = {
      id: entry.id,
      text,
      depth
    };
    const isSubmenu = entry.kind === MenuItemKind.SUBMENU;
    if (!isSubmenu) {
      return [own];
    }

    return [own, ...linesOf({
      entries: entry.items,
      depth: depth + 1
    })];
  });
}

/**
 * The menu as the tray would show it under a profile, one text line for each
 * line and submenu child, read now (dynamic labels and lists included).
 *
 * @param options - `items`: the declared menu; `profile`: the user's choice.
 * @returns The lines, depth first.
 */
export function previewLines<ItemId extends string>({ items, profile }: {
  readonly items: readonly MenuItem<ItemId>[];
  readonly profile: MenuProfile<ItemId>;
}) {
  return linesOf({
    entries: resolveMenu({
      items,
      profile
    }),
    depth: 0
  });
}
