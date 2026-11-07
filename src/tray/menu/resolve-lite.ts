import { expandMenu, ROOT_ID } from "./expand.ts";
import type { ExpandedItem } from "./expand.ts";
import { MenuItemKind } from "./types.ts";
import type {
  MenuCheckItem,
  MenuCommandItem,
  MenuItem,
  MenuProfile,
  MenuRadioItem,
  MenuSubmenuItem,
  ResolvedCommand,
  ResolvedMenuItem
} from "./types.ts";
import { valueOf } from "./values.ts";

type ActionItem<ItemId extends string> = MenuCommandItem<ItemId> | MenuCheckItem<ItemId> | MenuRadioItem<ItemId>;

const EMPTY_SUFFIX = ".empty" as const;

/** The step the full resolver adds: which items the profile keeps, and in what order each menu is drawn. */
export interface ResolveStage<ItemId extends string> {
  readonly isKept: (item: MenuItem<ItemId>) => boolean;
  readonly ordered: (options: {
    readonly nodes: ReadonlyArray<ExpandedItem<ItemId>>;
    readonly parentId: ItemId | typeof ROOT_ID;
  }) => ReadonlyArray<ExpandedItem<ItemId>>;
}

/** A function that makes the lines to draw from a declared menu; `resolveLite` and `resolveMenu` are two. */
export type MenuResolver<ItemId extends string = string> = (options: {
  readonly items: ReadonlyArray<MenuItem<ItemId>>;
  readonly profile?: MenuProfile<NoInfer<ItemId>>;
}) => Array<ResolvedMenuItem<ItemId>>;

function isContent<ItemId extends string>(entry: ResolvedMenuItem<ItemId>) {
  return entry.kind !== MenuItemKind.SEPARATOR && entry.kind !== MenuItemKind.HEADER;
}

function labelled<ItemId extends string>(item: ActionItem<ItemId> | MenuSubmenuItem<ItemId>) {
  const badge = item.badge && valueOf(item.badge);
  return {
    id: item.id,
    label: valueOf(item.label),
    isEnabled: valueOf(item.isEnabled ?? true),
    isBold: valueOf(item.isBold ?? false),
    closeThenRun: item.closeThenRun !== false,
    select() {
      item.onselect?.({ item });
    },
    ...item.icon ? { icon: item.icon } : {},
    ...badge ? { badge } : {}
  };
}

function actionOf<ItemId extends string>(item: ActionItem<ItemId>) {
  return {
    ...labelled(item),
    staysOpen: Boolean(item.staysOpen),
    ...item.shortcut ? { shortcut: item.shortcut } : {}
  };
}

function emptyPlaceholder<ItemId extends string>({ id, label }: {
  readonly id: ItemId;
  readonly label: string;
}) {
  return {
    kind: MenuItemKind.COMMAND,
    id: `${id}${EMPTY_SUFFIX}` as const,
    label,
    isEnabled: false,
    isBold: false,
    staysOpen: true,
    closeThenRun: false,
    select() {}
  } satisfies ResolvedCommand<ItemId>;
}

function tidy<ItemId extends string>(entries: ReadonlyArray<ResolvedMenuItem<ItemId>>) {
  const result: Array<ResolvedMenuItem<ItemId>> = [];
  for (const [i, entry] of entries.entries()) {
    const next = entries[i + 1];
    const isEmptyHeader = entry.kind === MenuItemKind.HEADER && !(next && isContent(next));
    const isRedundantSeparator = entry.kind === MenuItemKind.SEPARATOR
      && (result.at(-1)?.kind ?? MenuItemKind.SEPARATOR) === MenuItemKind.SEPARATOR;
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

function resolveSubmenu<ItemId extends string>({ node, stage }: {
  readonly node: ExpandedItem<ItemId>;
  readonly stage?: ResolveStage<ItemId> | undefined;
}) {
  const { item, children } = node;
  const isSubmenu = item.kind === MenuItemKind.SUBMENU;
  if (!isSubmenu) {
    return undefined;
  }

  const inner = resolveNodes({
    nodes: children,
    parentId: item.id,
    stage
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
    autoExpand: Boolean(item.autoExpand),
    items
  } satisfies ResolvedMenuItem<ItemId>;
}

function resolveNode<ItemId extends string>({ node, stage }: {
  readonly node: ExpandedItem<ItemId>;
  readonly stage?: ResolveStage<ItemId> | undefined;
}) {
  const { item } = node;
  switch (item.kind) {
    case MenuItemKind.SEPARATOR:
      return {
        kind: item.kind,
        id: item.id
      } satisfies ResolvedMenuItem<ItemId>;
    case MenuItemKind.HEADER:
      return {
        kind: item.kind,
        id: item.id,
        label: valueOf(item.label)
      } satisfies ResolvedMenuItem<ItemId>;
    case MenuItemKind.SUBMENU:
      return resolveSubmenu({
        node,
        stage
      });
    case MenuItemKind.COMMAND:
      return {
        kind: item.kind,
        ...actionOf(item)
      } satisfies ResolvedMenuItem<ItemId>;
    case MenuItemKind.CHECK:
      return {
        kind: item.kind,
        ...actionOf(item),
        isChecked: valueOf(item.isChecked ?? false)
      } satisfies ResolvedMenuItem<ItemId>;
    case MenuItemKind.RADIO:
      return {
        kind: item.kind,
        group: item.group,
        ...actionOf(item),
        isChecked: valueOf(item.isChecked ?? false)
      } satisfies ResolvedMenuItem<ItemId>;
  }
}

function isVisible<ItemId extends string>(item: MenuItem<ItemId>) {
  return !("isVisible" in item) || valueOf(item.isVisible ?? true);
}

/**
 * The lines of one menu: the items shown, in the order the stage gives (declared order without one),
 * then separators collapsed, empty headers and empty submenus dropped. The core of `resolveLite`
 * and of `resolveMenu`, which adds the stage.
 *
 * @param options - `nodes`: the expanded items of the menu; `parentId`: its id; `stage`: the profile step.
 * @returns The lines to draw.
 */
// eslint-disable-next-line no-restricted-syntax -- a recursive function needs its return type written
export function resolveNodes<ItemId extends string>({ nodes, parentId, stage }: {
  readonly nodes: ReadonlyArray<ExpandedItem<ItemId>>;
  readonly parentId: ItemId | typeof ROOT_ID;
  readonly stage?: ResolveStage<ItemId> | undefined;
}): Array<ResolvedMenuItem<ItemId>> {
  const shown = nodes.filter(({ item }) => isVisible(item) && (stage?.isKept(item) ?? true));
  const sequence = stage?.ordered({
    nodes: shown,
    parentId
  }) ?? shown;
  const entries = sequence.map(node => resolveNode({
    node,
    stage
  }));
  return tidy(entries.filter(entry => entry !== undefined));
}

/**
 * Makes the tree a renderer draws from the declared menu, with no profile: every item at any level
 * is shown, in declared order. Every function value (label, state, dynamic list) is read now, so
 * call it each time the menu opens. Separators are collapsed, headers with nothing under them
 * dropped, and a submenu with nothing in it dropped (or shown as its `emptyLabel`). It is what
 * `resolveMenu` does before its level, profile and order step, and it leaves that step out of a bundle.
 *
 * @param options - `items`: the declared menu.
 * @returns The lines to draw.
 * @throws MenuModelError - An id is used twice, or a radio has no group.
 */
export function resolveLite<const ItemId extends string>({ items }: {
  readonly items: ReadonlyArray<MenuItem<ItemId>>;
}) {
  return resolveNodes({
    nodes: expandMenu({ items }),
    parentId: ROOT_ID
  });
}
