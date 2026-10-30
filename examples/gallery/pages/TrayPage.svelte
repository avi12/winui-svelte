<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import { writeIconFile } from "#examples/tray/icon-file.ts";
  import { TextBlock, ToggleSwitch } from "winui-svelte/components";
  import { TrayIcon } from "winui-svelte/tray";

  const GUID = "6f1d3c52-8c1a-4a55-9d0e-7b2f4e9a1c04";
  const ICON = writeIconFile({
    name: "gallery",
    red: 0,
    green: 160,
    blue: 200
  });

  let isShown = $state(false);
</script>

<PageFrame
  caption="A notification-area icon, drawn by the shell. WinUI has no API for it, so the package talks to Shell_NotifyIcon. It stays out until you switch it on."
  title="Tray icon"
>
  <ToggleSwitch {@attach keyControl("tray")} header="Show a tray icon" bind:isOn={isShown} />
  <TextBlock text={isShown ? "Look in the notification area" : "No icon yet"} />
  {#if isShown}
    <TrayIcon guid={GUID} icon={ICON} tooltip="winui-svelte gallery" />
  {/if}
</PageFrame>
