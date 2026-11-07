<script lang="ts" module>
  import { activateOrLaunch, MenuLevel, resolveMenu } from "winui-svelte/tray/standalone";
  import type { TrayEntrypoint } from "winui-svelte/tray/standalone";

  // The tray is its own entrypoint, written as markup. The build lowers the
  // markup below to the plain menu model, so none of Svelte's runtime is in
  // tray.js; the menu is read each time it opens, so plain variables are
  // current and no $state is needed (or allowed).
  const APP_KEY = "tray-entrypoint-svelte-example";
  const RECENT_COUNT = 3;
  let isAutostart = false;

  function openApp() {
    void activateOrLaunch({
      key: APP_KEY,
      activation: {
        arguments: [],
        workingDirectory: "."
      },
      launch: {
        command: process.execPath,
        arguments: ["main.js"]
      }
    });
  }

  function toggleAutostart() {
    isAutostart = !isAutostart;
  }

  function recentCaptures() {
    return Array.from({ length: RECENT_COUNT }, (_, iCapture) => `capture-${iCapture + 1}.png`);
  }

  export const options = {
    icon: "tray.ico",
    tooltip: "Tray entrypoint (Svelte) example",
    guid: "3b0e8f4a-6c52-4d1e-9a77-5c1d2e8b4f90",
    onactivate: openApp,
    resolve: resolveMenu
  } satisfies Partial<TrayEntrypoint>;
</script>

<script lang="ts">
  import {
    TrayMenu,
    TrayMenuHeader,
    TrayMenuItem,
    TrayMenuSeparator,
    TrayMenuSubmenu
  } from "winui-svelte/tray/menu/svelte";
</script>

<TrayMenu>
  <TrayMenuHeader id="title" label="Recorder" />
  <TrayMenuItem id="open" isRequired label="Open" onselect={openApp} />
  <TrayMenuItem id="capture" label="Capture region" level={MenuLevel.STANDARD} />
  <TrayMenuItem id="record" label="Record screen" level={MenuLevel.FULL} />
  <TrayMenuSeparator id="divider" />
  <TrayMenuSubmenu id="recent" emptyLabel="Nothing yet" label="Recent captures" level={MenuLevel.STANDARD}>
    {#each recentCaptures() as name, iCapture (name)}
      {@const id = `recent.${iCapture}`}
      <TrayMenuItem {id} label={name} />
    {/each}
  </TrayMenuSubmenu>
  <TrayMenuItem id="autostart" isChecked={() => isAutostart} kind="check" label="Start with Windows" level={MenuLevel.STANDARD} onselect={toggleAutostart} />
  {#if isAutostart}
    <TrayMenuItem id="sign-in-delay" label="Delay at sign-in" level={MenuLevel.FULL} />
  {/if}
</TrayMenu>
