import { expandMenu, ROOT_ID } from "./expand.ts";
import type { ExpandedItem } from "./expand.ts";
import { defaultProfile } from "./profile.ts";
import { MenuItemKind, MenuLevel } from "./types.ts";
import type {
  MenuHeaderItem,
  MenuItem,
  MenuProfile,
  MenuSeparatorItem,
  ResolvedCommand,
  ResolvedMenuItem
} from "./types.ts";
import { isLevelShown, valueOf } from "./values.ts";

type LabelledItem = Exclude<MenuItem, MenuSeparatorItem | MenuHeaderItem>;

const EMPTY_SUFFIX = ".empty";

function isContent(entry: ResolvedMenuItem) {
  return entry.kind !== MenuItemKind.SEPARATOR && entry.kind !== MenuItemKind.HEADER;
}

function isShown({ item, profile }: {
  readonly item: MenuItem;
  readonly profile: MenuProfile;
}) {
  const isLabelled = item.kind !== MenuItemKind.SEPARATOR && item.kind !== MenuItemKind.HEADER;
  const isHiddenByApp = isLabelled && !valueOf(item.isVisible ?? true);
  if (isHiddenByApp) {
    return false;
  }

  if (item.isRequired) {
    return true;
  }

  const isHiddenByUser = profile.hidden.includes(item.id);
  const isShownByLevel = isLevelShown({
    itemLevel: item.level ?? MenuLevel.SIMPLE,
    level: profile.level
  });
  const isShownByUser = profile.shown.includes(item.id);
  return !isHiddenByUser && (isShownByLevel || isShownByUser);
}

function ordered({ nodes, profile, parentId }: {
  readonly nodes: readonly ExpandedItem[];
  readonly profile: MenuProfile;
  readonly parentId: string;
}) {
  const wanted = profile.order[parentId] ?? [];
  const first = new Set(wanted.flatMap(id => nodes.filter(node => node.item.id === id)));
  const rest = nodes.filter(node => !first.has(node));
  return [...first, ...rest];
}

function labelled(item: LabelledItem) {
  const badge = item.badge && valueOf(item.badge);
  return {
    id: item.id,
    label: valueOf(item.label),
    isEnabled: valueOf(item.isEnabled ?? true),
    isBold: valueOf(item.isBold ?? false),
    ...item.icon ? { icon: item.icon } : {},
    ...badge ? { badge } : {}
  };
}

function actionOf(item: LabelledItem) {
  return {
    closeThenRun: item.closeThenRun !== false,
    select() {
      item.onselect?.({ item });
    }
  };
}

function emptyPlaceholder({ id, label }: {
  readonly id: string;
  readonly label: string;
}) {
  return {
    kind: MenuItemKind.COMMAND,
    id: `${id}${EMPTY_SUFFIX}`,
    label,
    isEnabled: false,
    isBold: false,
    staysOpen: true,
    closeThenRun: false,
    select() {}
  } satisfies ResolvedCommand;
}

function tidy(entries: readonly ResolvedMenuItem[]) {
  const result: ResolvedMenuItem[] = [];
  for (const [i, entry] of entries.entries()) {
    const next = entries[i + 1];
    const isEmptyHeader = entry.kind === MenuItemKind.HEADER && (!next || !isContent(next));
    const isRedundantSeparator = entry.kind === MenuItemKind.SEPARATOR
      && (result.length === 0 || result.at(-1)?.kind === MenuItemKind.SEPARATOR);
    const isKept = !isEmptyHeader && !isRedundantSeparator;
    if (isKept) {
      result.push(entry);
    }
  }

  const isTrailingSeparator = result.at(-1)?.kind === MenuItemKind.SEPARATOR;
  if (isTrailingSeparator) {
    result.pop();
  }

  return result;
}

function resolveSubmenu({ node, profile }: {
  readonly node: ExpandedItem;
  readonly profile: MenuProfile;
}) {
  const { item, children } = node;
  const isSubmenu = item.kind === MenuItemKind.SUBMENU;
  if (!isSubmenu) {
    return undefined;
  }

  const inner = resolveList({
    nodes: children,
    profile,
    parentId: item.id
  });
  const hasContent = inner.some(isContent);
  const { emptyLabel } = item;
  const placeholder = emptyLabel ? [emptyPlaceholder({
    id: item.id,
    label: emptyLabel
  })] : [];
  const items = hasContent ? inner : placeholder;
  const isDropped = items.length === 0;
  if (isDropped) {
    return undefined;
  }

  return {
    kind: MenuItemKind.SUBMENU,
    ...labelled(item),
    ...actionOf(item),
    autoExpand: Boolean(item.autoExpand),
    items
  } satisfies ResolvedMenuItem;
}

function resolveNode({ node, profile }: {
  readonly node: ExpandedItem;
  readonly profile: MenuProfile;
}) {
  const { item } = node;
  switch (item.kind) {
    case MenuItemKind.SEPARATOR:
      return {
        kind: item.kind,
        id: item.id
      } satisfies ResolvedMenuItem;
    case MenuItemKind.HEADER:
      return {
        kind: item.kind,
        id: item.id,
        label: valueOf(item.label)
      } satisfies ResolvedMenuItem;
    case MenuItemKind.SUBMENU:
      return resolveSubmenu({
        node,
        profile
      });
    case MenuItemKind.COMMAND:
      return {
        kind: item.kind,
        ...labelled(item),
        ...actionOf(item),
        staysOpen: Boolean(item.staysOpen),
        ...item.shortcut ? { shortcut: item.shortcut } : {}
      } satisfies ResolvedMenuItem;
    case MenuItemKind.CHECK:
      return {
        kind: item.kind,
        ...labelled(item),
        ...actionOf(item),
        staysOpen: Boolean(item.staysOpen),
        ...item.shortcut ? { shortcut: item.shortcut } : {},
        isChecked: valueOf(item.isChecked ?? false)
      } satisfies ResolvedMenuItem;
    case MenuItemKind.RADIO:
      return {
        kind: item.kind,
        group: item.group,
        ...labelled(item),
        ...actionOf(item),
        staysOpen: Boolean(item.staysOpen),
        ...item.shortcut ? { shortcut: item.shortcut } : {},
        isChecked: valueOf(item.isChecked ?? false)
      } satisfies ResolvedMenuItem;
  }
}

// eslint-disable-next-line no-restricted-syntax -- a recursive function needs its return type written
function resolveList({ nodes, profile, parentId }: {
  readonly nodes: readonly ExpandedItem[];
  readonly profile: MenuProfile;
  readonly parentId: string;
}): ResolvedMenuItem[] {
  const shown = nodes.filter(({ item }) => isShown({
    item,
    profile
  }));
  const entries = ordered({
    nodes: shown,
    profile,
    parentId
  }).map(node => resolveNode({
    node,
    profile
  }));
  return tidy(entries.filter(entry => entry !== undefined));
}

/**
 * Makes the tree a renderer draws from the declared menu and the profile of
 * the user. Every function value (label, state, dynamic list) is read now, so
 * call it each time the menu opens.
 *
 * Items are kept by level, hidden and shown; an `isRequired` item survives
 * the profile (but not its own `isVisible`). Each menu is put in the order of
 * the profile, with ids the profile does not know after it in declared order.
 * Then separators are collapsed, headers with nothing under them dropped, and
 * a submenu with nothing in it dropped (or shown as its `emptyLabel`).
 *
 * @param options - `items`: the declared menu; `profile`: the choice of the user, `defaultProfile()` when left out.
 * @returns The lines to draw.
 * @throws MenuModelError - An id is used twice, or a radio has no group.
 */
export function resolveMenu({ items, profile = defaultProfile() }: {
  readonly items: readonly MenuItem[];
  readonly profile?: MenuProfile;
}) {
  return resolveList({
    nodes: expandMenu({ items }),
    profile,
    parentId: ROOT_ID
  });
}
