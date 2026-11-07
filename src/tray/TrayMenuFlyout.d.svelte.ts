import type { TrayMenuFlyoutProps } from "./tray-menu-flyout-props.ts";
import type { Component } from "svelte";

declare const TrayMenuFlyout: Component<TrayMenuFlyoutProps, Record<string, never>, "">;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default TrayMenuFlyout;
