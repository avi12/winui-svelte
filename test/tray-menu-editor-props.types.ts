import TrayMenuEditor from "#src/tray/menu-svelte/TrayMenuEditor.svelte";
import { defaultProfile, defineMenu } from "#src/tray/menu/index.js";
import type { MenuProfile } from "#src/tray/menu/index.js";
import type { ComponentInternals } from "svelte";

// Never run: `pnpm check` (tsc) reads it. The editor takes the ids of the menu
// it is given, and nothing else: each line under `@ts-expect-error` is refused,
// and the check fails if one were accepted.

declare const internals: ComponentInternals;
const items = defineMenu([
  {
    kind: "command",
    id: "open",
    label: "Open"
  },
  {
    kind: "command",
    id: "exit",
    label: "Exit",
    isRequired: true
  }
]);
const stranger: MenuProfile<"stranger"> = defaultProfile();

TrayMenuEditor(internals, {
  items,
  profile: defaultProfile(),
  isPreviewShown: true,
  labels: {
    title: "Menu"
  },
  onchange(profile) {
    profile.hidden.includes("open");
  }
});
TrayMenuEditor(internals, {
  items,
  // @ts-expect-error the profile names an id the menu does not have
  profile: stranger
});
TrayMenuEditor(internals, {
  items,
  onchange(profile) {
    // @ts-expect-error the profile can only hold the ids of the menu
    profile.hidden.includes("stranger");
  }
});
TrayMenuEditor(internals, {
  items,
  // @ts-expect-error an attribute the editor has no prop for
  color: "red"
});
TrayMenuEditor(internals, {
  items,
  labels: {
    // @ts-expect-error a label the editor does not write
    colour: "red"
  }
});
TrayMenuEditor(internals, {
  items,
  // @ts-expect-error a boolean prop
  isPreviewShown: "yes"
});
// @ts-expect-error the menu is required
TrayMenuEditor(internals, {});
