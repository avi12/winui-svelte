import { ContextMenuSurface, ContextType } from "./context-menu-types.ts";
import type { ContextItemType, OnClickData } from "./context-menu-types.ts";

/** One item as the store holds it; the menu model is made from these. */
export interface ContextMenuEntry {
  readonly id: string;
  type: ContextItemType;
  title: string;
  isChecked: boolean;
  isEnabled: boolean;
  isVisible: boolean;
  contexts: readonly ContextType[];
  parentId: string | undefined;
  onclick: ((info: OnClickData) => void) | undefined;
}

const CONTEXTS_OF_SURFACE: Readonly<Record<ContextMenuSurface, ReadonlySet<ContextType>>> = {
  [ContextMenuSurface.TRAY]: new Set<ContextType>([
    ContextType.ALL,
    ContextType.ACTION,
    ContextType.BROWSER_ACTION,
    ContextType.PAGE_ACTION
  ]),
  [ContextMenuSurface.WINDOW]: new Set<ContextType>([ContextType.ALL, ContextType.PAGE])
};

/** Whether the entry asks for a place this surface is; the other contexts have no native menu. */
export function isOnSurface({ entry, surface }: {
  entry: ContextMenuEntry;
  surface: ContextMenuSurface;
}) {
  const wanted = CONTEXTS_OF_SURFACE[surface];
  return entry.contexts.some(context => wanted.has(context));
}
