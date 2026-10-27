import type { ItemsComponent, ItemsComponentProps } from "./items/items-props.ts";

/** The props of `GridView`, generic over the items it shows. */
export type GridViewComponentProps<Item = object> = ItemsComponentProps<Item>;

declare const GridView: ItemsComponent;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default GridView;
