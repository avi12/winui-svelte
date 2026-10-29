import type { ItemRows } from "./item-rows.svelte.ts";
import { SLOT_ELEMENT, templateOf } from "./item-rows.svelte.ts";
import type { ListViewBase } from "#src/components/generated/bindings.js";
import {
  ContentControl,
  DataTemplate,
  GroupStyle,
  ListViewHeaderItem,
  projectAs,
  XamlReader
} from "#src/components/generated/bindings.js";

// The headers of a list's native groups. The list asks for a header container
// each time it needs one (ChoosingGroupHeaderContainer, with the group's place
// in the list), so the container is made here and its group's key kept against
// it; the row goes in the slot of the header template once the list has put the
// group in the container (its Content changed) and the template has a root.

/** Shows the app's `groupHeader` row in each header container the list makes. */
export class GroupHeaders<Item> {
  private readonly rows: ItemRows<Item>;
  private readonly groupKeys = new Map<string, string>();
  private readonly unsubscribe: Array<() => void> = [];

  constructor({ view, rows }: {
    view: ListViewBase;
    rows: ItemRows<Item>;
  }) {
    this.rows = rows;
    const style = new GroupStyle();
    style.headerTemplate = projectAs(XamlReader.load(templateOf(SLOT_ELEMENT)), DataTemplate);
    view.groupStyle.asVector().append(style);
    this.unsubscribe.push(
      view.onChoosingGroupHeaderContainer((_sender, args) => {
        const known = args.groupHeaderContainer;
        const isRecycled = known !== null && known !== undefined;
        const container = isRecycled ? projectAs(known, ListViewHeaderItem) : this.made();
        args.groupHeaderContainer = container;
        this.groupKeys.set(rows.idOf(container), rows.groupKeyAt(args.groupIndex));
      })
    );
  }

  dispose() {
    for (const unsubscribe of this.unsubscribe.splice(0)) {
      unsubscribe();
    }
  }

  // A new header container shows its row when the list gives it a group, and
  // when it is loaded, which is when a first template root exists.
  private made() {
    const container = new ListViewHeaderItem();
    const token = container.registerPropertyChangedCallback(ContentControl.contentProperty, () => this.show(container));
    this.unsubscribe.push(() => container.unregisterPropertyChangedCallback(ContentControl.contentProperty, token));
    return container;
  }

  private show(container: ListViewHeaderItem) {
    const root = container.contentTemplateRoot;
    const hasRoot = root !== null;
    if (!hasRoot) {
      const unsubscribeLoaded = container.onLoaded(() => {
        unsubscribeLoaded();
        this.show(container);
      });
      return;
    }

    this.rows.showHeader({
      container,
      slot: projectAs(root, ContentControl),
      groupKey: this.groupKeys.get(this.rows.idOf(container)) ?? ""
    });
  }
}
