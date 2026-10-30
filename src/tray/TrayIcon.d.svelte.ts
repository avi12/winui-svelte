import type { TrayIconComponentProps } from "./tray-icon-props.ts";
import type { Component } from "svelte";

declare const TrayIcon: Component<TrayIconComponentProps, Record<string, never>, "handle" | "menuAt">;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default TrayIcon;
