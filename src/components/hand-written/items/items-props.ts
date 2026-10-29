import type { ItemRowsProps } from "./item-rows.svelte.ts";
import type { ItemsHostProps, ListHandle } from "./items-host.svelte.ts";
import type { TreeHostProps } from "./tree-host.svelte.ts";
import type { ComponentConstructorOptions, ComponentInternals, SvelteComponent } from "svelte";

// The props and the type of the components that show items by a snippet
// (generated: scripts/codegen/tables.ts, itemsHosted), generic over the items.

// What the components take besides the control's own properties: the items
// replace the children and the items collection, the item template and the
// items source, which the component owns.
type OwnedByComponent = "children" | "items" | "itemsSource" | "itemTemplate" | "itemTemplateSelector";

// What a tree component leaves to the component besides: the control's own
// node collections and selection, which the items replace.
type OwnedByTree = OwnedByComponent | "rootNodes" | "selectedItem" | "selectedNode" | "selectedNodes";

interface HandleProps {
  // The list's imperative side (`bind:handle`).
  handle?: ListHandle | undefined;
}

/** Every prop a list component takes: its items, its control's properties (with their element props) and `handle`. */
export type ListComponentProps<Item, ControlProps> = ItemsHostProps<Item>
  & Omit<ControlProps, OwnedByComponent>
  & HandleProps;

/** Every prop a component that shows its items in an ItemsRepeater takes. */
export type RepeaterComponentProps<Item, ControlProps> = ItemRowsProps<Item>
  & Omit<ControlProps, OwnedByComponent>;

/** Every prop a component that shows its items as a tree takes. */
export type TreeComponentProps<Item, ControlProps> = TreeHostProps<Item> & Omit<ControlProps, OwnedByTree>;

/**
 * A list component, generic over its items, typed as svelte2tsx types a
 * generic .svelte file: svelte-check keeps the generic of a component with a
 * construct signature, and of a plain function component infers its props once
 * with Item unknown, so `items={rows}` would not type the item snippet's row.
 */
export interface ListComponent<ControlProps> {
  new <Item>(
    options: ComponentConstructorOptions<ListComponentProps<Item, ControlProps>>
  ): SvelteComponent<ListComponentProps<Item, ControlProps>>;
  <Item>(internals: ComponentInternals, props: ListComponentProps<Item, ControlProps>): Record<string, never>;
}

/** A component that shows its items in an ItemsRepeater, typed as `ListComponent` is. */
export interface RepeaterComponent<ControlProps> {
  new <Item>(
    options: ComponentConstructorOptions<RepeaterComponentProps<Item, ControlProps>>
  ): SvelteComponent<RepeaterComponentProps<Item, ControlProps>>;
  <Item>(internals: ComponentInternals, props: RepeaterComponentProps<Item, ControlProps>): Record<string, never>;
}

/** A component that shows its items as a tree, typed as `ListComponent` is. */
export interface TreeComponent<ControlProps> {
  new <Item>(
    options: ComponentConstructorOptions<TreeComponentProps<Item, ControlProps>>
  ): SvelteComponent<TreeComponentProps<Item, ControlProps>>;
  <Item>(internals: ComponentInternals, props: TreeComponentProps<Item, ControlProps>): Record<string, never>;
}
