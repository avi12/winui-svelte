import type { SelectionOverlayProps } from "./selection-overlay-props.ts";
import type { Component } from "svelte";

export type { SelectionOverlayProps };

declare const SelectionOverlay: Component<SelectionOverlayProps>;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default SelectionOverlay;
