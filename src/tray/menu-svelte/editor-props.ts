import type { TrayMenuEditorLabels } from "./editor-labels.ts";
import type { MenuItem, MenuProfile } from "#src/tray/menu/types.js";

/**
 * The props of `TrayMenuEditor`. `ItemId` is the union of the ids of `items`
 * when it is a model menu, so that `profile` and `onchange` are checked
 * against them.
 */
export interface TrayMenuEditorProps<ItemId extends string = string> {
  /** The menu the app declares: the same lines the `TrayIcon` draws. */
  readonly items: ReadonlyArray<MenuItem<ItemId>>;

  /** The user's choice; `bind:profile` keeps it in step with the editor. The default profile when left out. */
  profile?: MenuProfile<NoInfer<ItemId>> | undefined;

  /** Runs with the new profile after every edit. The editor never reads or writes a file: the app saves it. */
  readonly onchange?: ((profile: MenuProfile<NoInfer<ItemId>>) => void) | undefined;

  /** Adds a Save button that runs this with the current profile, for an app that saves on request. */
  readonly onsave?: ((profile: MenuProfile<NoInfer<ItemId>>) => void) | undefined;

  /** The strings of the editor; each one left out stays English. */
  readonly labels?: Partial<TrayMenuEditorLabels> | undefined;

  /** True lists the menu as it resolves under the profile, as plain rows. Default false. */
  readonly isPreviewShown?: boolean | undefined;
}
