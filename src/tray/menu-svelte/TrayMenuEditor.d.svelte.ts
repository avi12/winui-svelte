import type { TrayMenuEditorProps } from "./editor-props.ts";
import type { ComponentConstructorOptions, ComponentInternals, SvelteComponent } from "svelte";

// Generic over the ids of a model menu, so that `profile` is checked against them; see TrayIcon.d.svelte.ts.
interface TrayMenuEditorComponent {
  new <const ItemId extends string = string>(
    options: ComponentConstructorOptions<TrayMenuEditorProps<ItemId>>
  ): SvelteComponent<TrayMenuEditorProps<ItemId>>;
  <const ItemId extends string = string>(
    internals: ComponentInternals,
    props: TrayMenuEditorProps<ItemId>
  ): Record<string, never>;
}

declare const TrayMenuEditor: TrayMenuEditorComponent;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default TrayMenuEditor;
