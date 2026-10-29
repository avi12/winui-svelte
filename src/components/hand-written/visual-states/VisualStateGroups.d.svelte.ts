import type { Component } from "svelte";
import type { Snippet } from "svelte";

/** What `VisualStateGroups` takes. */
export interface VisualStateGroupsProps {
  /** The `VisualStateGroup` components of the element. */
  children?: Snippet;
}

declare const VisualStateGroups: Component<VisualStateGroupsProps>;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default VisualStateGroups;
