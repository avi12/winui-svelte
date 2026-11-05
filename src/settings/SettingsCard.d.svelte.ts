import type { SettingsCardProps } from "./settings-props.ts";
import type { Component } from "svelte";

export type { SettingsCardProps };

/**
 * A setting as a Fluent card: an icon, the name and a description on the left,
 * its control on the right, and with `isClickEnabled` the whole card a button.
 */
declare const SettingsCard: Component<SettingsCardProps, Record<string, never>, "">;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default SettingsCard;
