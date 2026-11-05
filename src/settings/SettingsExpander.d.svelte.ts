import type { SettingsExpanderProps } from "./settings-props.ts";
import type { Component } from "svelte";

export type { SettingsExpanderProps };

/**
 * A settings card that opens: its header is a card row, and its `items` (more
 * `SettingsCard`s) slide open below it.
 */
declare const SettingsExpander: Component<SettingsExpanderProps, Record<string, never>, "isExpanded">;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default SettingsExpander;
