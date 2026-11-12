import type { SettingsCardProps } from "./settings-props.ts";
import type { Component } from "svelte";

export type { SettingsCardProps };

/**
 * A setting as a Fluent card: an icon, the name and a description on the left,
 * its control on the right, and with `isClickEnabled` the whole card a button.
 */
declare const SettingsCard: Component<SettingsCardProps, Record<string, never>, "">;
export default SettingsCard;
