<script lang="ts">
  // A tray menu written as markup, for collect.test.ts: an {#if} and a keyed
  // {#each} inside a submenu, a check driven by state, a function prop.
  import TrayMenu from "./TrayMenu.svelte";
  import TrayMenuHeader from "./TrayMenuHeader.svelte";
  import TrayMenuItem from "./TrayMenuItem.svelte";
  import TrayMenuSeparator from "./TrayMenuSeparator.svelte";
  import TrayMenuSubmenu from "./TrayMenuSubmenu.svelte";
  import { MenuLevel } from "#src/tray/menu/types.js";

  const { onopen }: { onopen: () => void } = $props();
  let names = $state(["alpha", "beta"]);
  let isAutostart = $state(false);
  let isHeaderShown = $state(true);

  export function showNames(next: string[]) {
    names = next;
  }

  export function setAutostart(isOn: boolean) {
    isAutostart = isOn;
  }

  export function showHeader(isShown: boolean) {
    isHeaderShown = isShown;
  }
</script>

<TrayMenu>
  {#if isHeaderShown}
    <TrayMenuHeader id="title" label="Recorder" />
  {/if}
  <TrayMenuItem id="open" label="Open" onselect={onopen} shortcut="Ctrl+O" />
  <TrayMenuSeparator id="divider" />
  <TrayMenuItem id="autostart" isChecked={isAutostart} kind="check" label="Start with Windows" level={MenuLevel.STANDARD} />
  <TrayMenuSubmenu id="recent" emptyLabel="Nothing yet" label="Recent">
    {#each names as name (name)}
      <TrayMenuItem id={`recent.${name}`} label={name} />
    {/each}
  </TrayMenuSubmenu>
  <TrayMenuItem id="mode.fast" group="mode" isChecked kind="radio" label="Fast" />
</TrayMenu>
