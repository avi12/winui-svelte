import type { ItemRowsProps } from "./item-rows.svelte.ts";
import { ItemRows, SLOT_ELEMENT, templateOf } from "./item-rows.svelte.ts";
import type { UIElement } from "#src/components/generated/bindings.js";
import {
  ContentControl,
  Control,
  DataTemplate,
  FrameworkElement,
  ItemContainer,
  ItemsRepeater,
  projectAs,
  XamlReader
} from "#src/components/generated/bindings.js";

// What ItemsRepeater, and the controls that show their items in one (ItemsView,
// BreadcrumbBar), add to the control: a list of the app's items, shown by a row
// the app writes as a snippet. The repeater makes an element for each item it
// shows (ElementPrepared) and recycles it (ElementClearing), where a ListView
// reports its containers (items-host.svelte.ts); the rows are the same.

// The repeater of a control that keeps one in its template.
const REPEATER_PART = "PART_ItemsRepeater";

/** What a repeater makes of an item: where in the element the row goes. */
export const RepeaterElement = {
  /**
   * The element is a ContentControl, the slot: the template's root
   * (ItemsRepeater), or a container that shows the row as its content
   * (BreadcrumbBar's items).
   */
  SLOT: "slot",
  /** The element is an ItemContainer made by the template, which holds the slot (ItemsView). */
  ITEM_CONTAINER: "itemContainer"
} as const;

/** One of `RepeaterElement`'s values. */
export type RepeaterElement = (typeof RepeaterElement)[keyof typeof RepeaterElement];

// A control that shows its items in an ItemsRepeater: the repeater itself, or
// one in its template.
interface ItemsHolder {
  itemsSource: unknown;
  itemTemplate: unknown;
}

const templateRoots = new Map<RepeaterElement, string>([
  [RepeaterElement.SLOT, SLOT_ELEMENT],
  [RepeaterElement.ITEM_CONTAINER, `<ItemContainer>${SLOT_ELEMENT}</ItemContainer>`]
]);

function templateFor(kind: RepeaterElement) {
  const root = templateRoots.get(kind);
  const isKnown = root !== undefined;
  if (!isKnown) {
    throw new RangeError(`no item template for ${kind}`);
  }

  return projectAs(XamlReader.load(templateOf(root)), DataTemplate);
}

function slotOf({ element, kind }: {
  element: UIElement;
  kind: RepeaterElement;
}) {
  const isItemContainer = kind === RepeaterElement.ITEM_CONTAINER;
  if (isItemContainer) {
    return projectAs(projectAs(element, ItemContainer).child, ContentControl);
  }

  return projectAs(element, ContentControl);
}

// The repeater a control keeps in its template, which exists once the template
// is applied.
function repeaterIn(owner: FrameworkElement) {
  const control = projectAs(owner, Control);
  control.applyTemplate();
  const part = control.getTemplateChild(REPEATER_PART);
  return part === null ? null : projectAs(part, ItemsRepeater);
}

class RepeaterHost<Item> {
  private readonly rows: ItemRows<Item>;
  private readonly kind: RepeaterElement;
  private readonly unsubscribe: Array<() => void> = [];
  private repeater: ItemsRepeater | null = null;

  constructor({ props, kind }: {
    props: ItemRowsProps<Item>;
    kind: RepeaterElement;
  }) {
    this.rows = new ItemRows({
      props,
      onSynced: () => this.showRealized()
    });
    this.kind = kind;
  }

  get keys() {
    return this.rows.keys;
  }

  listen(repeater: ItemsRepeater) {
    this.repeater = repeater;
    this.unsubscribe.push(
      repeater.onElementPrepared((_sender, args) => this.show({
        element: args.element,
        index: args.index
      })),
      repeater.onElementClearing((_sender, args) => {
        this.rows.release(projectAs(args.element, FrameworkElement));
      })
    );
    this.showRealized();
  }

  // The elements the repeater made before the items were known (the control
  // laid out before its repeater was found, or before the first sync) show
  // their rows too.
  private showRealized() {
    const { repeater } = this;
    const isListening = repeater !== null;
    if (!isListening) {
      return;
    }

    for (let i = 0; i < this.rows.order.length; i++) {
      const element = repeater.tryGetElement(i);
      const isRealized = element !== null;
      if (isRealized) {
        this.show({
          element,
          index: i
        });
      }
    }
  }

  dispose() {
    for (const unsubscribe of this.unsubscribe.splice(0)) {
      unsubscribe();
    }

    this.rows.clear();
  }

  private show({ element, index }: {
    element: UIElement;
    index: number;
  }) {
    const key = this.rows.order[index];
    const isKnown = key !== undefined;
    if (isKnown) {
      this.rows.show({
        container: projectAs(element, FrameworkElement),
        slot: slotOf({
          element,
          kind: this.kind
        }),
        key
      });
    }
  }
}

/**
 * Connects the control to the props: call it from the component's control
 * attachment. A control that keeps its repeater in its template (ItemsView,
 * BreadcrumbBar) has it once the template is applied.
 */
export function attachRepeaterItems<Item>({ owner, props, kind }: {
  owner: FrameworkElement & ItemsHolder;
  props: ItemRowsProps<Item>;
  kind: RepeaterElement;
}) {
  const host = new RepeaterHost({
    props,
    kind
  });
  owner.itemTemplate = templateFor(kind);
  owner.itemsSource = host.keys;
  const releases: Array<() => void> = [];
  function listenWhenFound() {
    const repeater = owner instanceof ItemsRepeater ? owner : repeaterIn(owner);
    const isFound = repeater !== null;
    if (isFound) {
      host.listen(repeater);
    }

    return isFound;
  }

  const isFoundNow = listenWhenFound();
  if (!isFoundNow) {
    releases.push(owner.onceLoaded(listenWhenFound));
  }

  return {
    dispose() {
      for (const release of releases) {
        release();
      }

      host.dispose();
    }
  };
}
