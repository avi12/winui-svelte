import type { NavigatorComponentProps } from "./navigator-props.ts";
import type { Component } from "svelte";

export type { NavigatorComponentProps };

declare const Navigator: Component<NavigatorComponentProps, Record<string, never>, "handle">;
export default Navigator;
