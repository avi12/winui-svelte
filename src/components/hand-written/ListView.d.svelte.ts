import type { ItemsComponent, ItemsComponentProps } from "./items/items-props.ts";

/** The props of `ListView`, generic over the items it shows. */
export type ListViewComponentProps<Item = object> = ItemsComponentProps<Item>;

declare const ListView: ItemsComponent;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default ListView;
