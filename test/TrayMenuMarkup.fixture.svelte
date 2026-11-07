<script lang="ts">
  // Never mounted: `pnpm check` (svelte-check, under exactOptionalPropertyTypes)
  // reads it. The tray menu written as markup, and as a model with ids that
  // stay literal: what must be accepted. tray-menu-props.types.ts holds what
  // must be rejected.
  import { MenuLevel } from "#src/enums.js";
  import { TrayIcon } from "#src/tray/index.js";
  import {
    TrayMenu,
    TrayMenuHeader,
    TrayMenuItem,
    TrayMenuSeparator,
    TrayMenuSubmenu
  } from "#src/tray/menu-svelte/index.js";
  import { defaultProfile, defineMenu } from "#src/tray/menu/index.js";
  import type { MenuIds, MenuProfile } from "#src/tray/menu/index.js";

  const items = defineMenu([
    {
      kind: "command",
      id: "open",
      label: "Open"
    },
    {
      kind: "command",
      id: "quit",
      label: "Quit"
    }
  ]);
  const profile: MenuProfile<MenuIds<typeof items>> = defaultProfile();
</script>

<TrayIcon icon="a.ico" menu={items} {profile} />

<TrayIcon icon="a.ico">
  <TrayMenu profile={defaultProfile()}>
    <TrayMenuHeader id="title" label="Recorder" />
    <TrayMenuItem id="open" label="Open" level={MenuLevel.STANDARD} onselect={() => {}} />
    <TrayMenuItem id="auto" isChecked kind="check" label="Autostart" />
    <TrayMenuItem id="fast" group="mode" kind="radio" label="Fast" />
    <TrayMenuSeparator id="divider" />
    <TrayMenuSubmenu id="more" label="More">
      <TrayMenuItem id="more.one" label="One" />
    </TrayMenuSubmenu>
  </TrayMenu>
</TrayIcon>
