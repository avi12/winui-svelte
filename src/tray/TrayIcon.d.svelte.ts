import type { TrayIconComponentProps } from "./tray-icon-props.ts";
import type { ComponentConstructorOptions, ComponentInternals, SvelteComponent } from "svelte";

// Generic over the ids of a model menu, so that `profile` is checked against them. svelte-check infers a generic
// component from a construct signature, as it does for a component it compiles itself.
interface TrayIconComponent {
  new <const ItemId extends string = string>(
    options: ComponentConstructorOptions<TrayIconComponentProps<ItemId>>
  ): SvelteComponent<TrayIconComponentProps<ItemId>>;
  <const ItemId extends string = string>(
    internals: ComponentInternals,
    props: TrayIconComponentProps<ItemId>
  ): Record<string, never>;
}

declare const TrayIcon: TrayIconComponent;
export default TrayIcon;
