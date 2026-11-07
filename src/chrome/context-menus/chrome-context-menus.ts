import { buildMenu, childrenOf, radioRunOf } from "./build-menu.ts";
import type { ContextMenuEntry } from "./context-menu-entry.ts";
import { parseCreate, parseUpdate } from "./context-menu-schema.ts";
import { ContextItemType, ContextType } from "./context-menu-types.ts";
import type { ContextMenuSurface, CreateProperties, OnClickData, UpdateProperties } from "./context-menu-types.ts";
import { ChromeEvent } from "#src/downloads/chrome-event.js";
import type { MenuItem } from "#src/tray/menu/types.js";

const ID_PREFIX = "contextMenu-";

function assertTitle({ type, title }: {
  type: ContextItemType;
  title: string;
}) {
  const isMissingTitle = type !== ContextItemType.SEPARATOR && title === "";
  if (isMissingTitle) {
    throw new Error("Title is required unless the item is a separator");
  }
}

/**
 * `chrome.contextMenus` for a native app, kept in one list of items and drawn
 * by the tray menu model (`winui-svelte/tray/menu`). `menu(surface)` gives the
 * lines of a surface for `TrayIcon` (`menu={...}`) or for a window's context
 * flyout, so the app has one menu implementation, not two.
 */
export class ChromeContextMenus {
  /** Fires after an item is picked, once its own `onclick` has run. */
  readonly onClicked = new ChromeEvent<(info: OnClickData) => void>();

  private readonly entries = new Map<string, ContextMenuEntry>();
  private readonly surfaces = new Map<ContextMenuSurface, MenuItem[]>();
  private nextId = 1;

  /**
   * Adds an item.
   *
   * @param properties - Chrome's `CreateProperties`.
   * @returns The id of the item, made up when `properties.id` is left out.
   * @throws {Error} For a bad shape, a duplicate id, a missing parent or a missing title.
   */
  create(properties: CreateProperties) {
    const parsed = parseCreate(properties);
    const id = parsed.id ?? this.makeId();
    if (this.entries.has(id)) {
      throw new Error(`Cannot create item with duplicate id ${id}`);
    }

    const type = parsed.type ?? ContextItemType.NORMAL;
    const title = parsed.title ?? "";
    assertTitle({
      type,
      title
    });
    const parentId = this.parentOf(parsed.parentId);
    this.entries.set(id, {
      id,
      type,
      title,
      isChecked: parsed.checked ?? false,
      isEnabled: parsed.enabled ?? true,
      isVisible: parsed.visible ?? true,
      contexts: parsed.contexts ?? [ContextType.PAGE],
      parentId,
      onclick: parsed.onclick
    });
    this.refresh();
    return id;
  }

  /**
   * Changes the properties that are given and keeps the rest.
   *
   * @param id - The item.
   * @param properties - Chrome's `UpdateProperties`.
   * @throws {Error} Rejects for an unknown item, a bad shape, a missing parent or a parent that is the item or
   * under it.
   */
  // eslint-disable-next-line no-restricted-syntax -- chrome.contextMenus.update(id, properties) is positional
  async update(id: string | number, properties: UpdateProperties) {
    const entry = this.entryOf(id);
    const parsed = parseUpdate(properties);
    const hasParentId = parsed.parentId !== undefined;
    const parentId = hasParentId ? this.parentOf(parsed.parentId) : entry.parentId;
    this.assertNotInside({
      entry,
      parentId
    });
    const type = parsed.type ?? entry.type;
    const title = parsed.title ?? entry.title;
    assertTitle({
      type,
      title
    });
    entry.type = type;
    entry.title = title;
    entry.isChecked = parsed.checked ?? entry.isChecked;
    entry.isEnabled = parsed.enabled ?? entry.isEnabled;
    entry.isVisible = parsed.visible ?? entry.isVisible;
    entry.contexts = parsed.contexts ?? entry.contexts;
    entry.onclick = parsed.onclick ?? entry.onclick;
    entry.parentId = parentId;
    this.refresh();
  }

  /**
   * Removes an item and the items under it.
   *
   * @param id - The item.
   * @throws {Error} Rejects for an unknown item.
   */
  async remove(id: string | number) {
    const { id: key } = this.entryOf(id);
    this.removeTree(key);
    this.refresh();
  }

  /** Removes every item. */
  async removeAll() {
    this.entries.clear();
    this.refresh();
  }

  /**
   * The lines of one native menu, in the tray menu model. The array is the same
   * one every time and is rewritten in place when an item changes, so a menu that
   * reads it when it opens always shows the current items.
   *
   * @param surface - `tray` for the tray icon's menu (contexts `action`, `browser_action`,
   * `page_action`, `all`), `window` for a window's context flyout (`page`, `all`).
   * @returns The lines; an item whose contexts are all others (`frame`, `selection`, `link`,
   * `editable`, `image`, `video`, `audio`, `launcher`) is on no surface.
   */
  menu(surface: ContextMenuSurface) {
    const existing = this.surfaces.get(surface);
    if (existing) {
      return existing;
    }

    const lines: MenuItem[] = [];
    this.surfaces.set(surface, lines);
    this.refresh();
    return lines;
  }

  private makeId() {
    let id = `${ID_PREFIX}${this.nextId}`;
    while (this.entries.has(id)) {
      this.nextId += 1;
      id = `${ID_PREFIX}${this.nextId}`;
    }

    this.nextId += 1;
    return id;
  }

  private entryOf(id: string | number) {
    const entry = this.entries.get(String(id));
    if (!entry) {
      throw new Error(`Cannot find menu item with id ${id}`);
    }

    return entry;
  }

  private parentOf(parentId: string | number | undefined) {
    const hasNoParent = parentId === undefined;
    if (hasNoParent) {
      return undefined;
    }

    const { id } = this.entryOf(parentId);
    return id;
  }

  private assertNotInside({ entry, parentId }: {
    entry: ContextMenuEntry;
    parentId: string | undefined;
  }) {
    let cursor = parentId;
    while (cursor !== undefined) {
      const isSelf = cursor === entry.id;
      if (isSelf) {
        throw new Error("Cannot update item: it cannot be its own parent or under itself");
      }

      cursor = this.entries.get(cursor)?.parentId;
    }
  }

  private removeTree(id: string) {
    for (const child of childrenOf({
      entries: this.entries,
      parentId: id
    })) {
      this.removeTree(child.id);
    }

    this.entries.delete(id);
  }

  private select(id: string) {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }

    const isCheckedBefore = entry.isChecked;
    const isCheckbox = entry.type === ContextItemType.CHECKBOX;
    const isRadio = entry.type === ContextItemType.RADIO;
    if (isCheckbox) {
      entry.isChecked = !isCheckedBefore;
    }

    if (isRadio) {
      const siblings = childrenOf({
        entries: this.entries,
        parentId: entry.parentId
      });
      for (const sibling of radioRunOf({
        siblings,
        entry
      })) {
        sibling.isChecked = sibling === entry;
      }
    }

    this.refresh();
    const info: OnClickData = {
      menuItemId: id,
      editable: false,
      ...entry.parentId !== undefined && {
        parentMenuItemId: entry.parentId
      },
      ...(isCheckbox || isRadio) && {
        checked: entry.isChecked,
        wasChecked: isCheckedBefore
      }
    };
    entry.onclick?.(info);
    this.onClicked.dispatch(info);
  }

  private refresh() {
    for (const [surface, lines] of this.surfaces) {
      lines.splice(
        0, lines.length, ...buildMenu({
          entries: this.entries,
          surface,
          select: id => this.select(id)
        })
      );
    }
  }
}
