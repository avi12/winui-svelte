import type { TrayIconHandle, TrayIconOptions } from "./tray-core.ts";
import type { Component } from "svelte";

/** The props of `TrayIcon`: the options of `createTrayIcon`, and the live handle to bind. */
export interface TrayIconComponentProps extends TrayIconOptions {
  /** `bind:handle` gives `notify`, `bounds` and `remove`. */
  handle?: TrayIconHandle | undefined;
}

declare const TrayIcon: Component<TrayIconComponentProps, Record<string, never>, "handle">;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default TrayIcon;
