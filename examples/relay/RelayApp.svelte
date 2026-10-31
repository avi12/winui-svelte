<script lang="ts">
  import { writeIconFile } from "#examples/tray/icon-file.ts";
  import { mkdtempSync, watch, writeFileSync } from "node:fs";
  import { tmpdir } from "node:os";
  import path from "node:path";
  import { TextBlock, Window } from "winui-svelte/components";
  import type { HostChannel } from "winui-svelte/state";
  import { TrayIcon } from "winui-svelte/tray";
  import { Backdrop, exitApplication, systemSettings } from "winui-svelte/window";

  const GUID = "0b8d1f0e-3b8a-4e0b-9a43-5c8b0f6d2a71";
  const BLUE = 160;
  const WINDOW_WIDTH = 360;
  const WINDOW_HEIGHT = 240;
  const ICON = writeIconFile({
    name: "relay",
    red: 20,
    green: 40,
    blue: BLUE
  });

  const { channel, report }: {
    channel: HostChannel;
    report(message: object): void;
  } = $props();
  const settings = systemSettings();
  const WATCHED_FOLDER = mkdtempSync(path.join(tmpdir(), "relay-"));
  writeFileSync(path.join(WATCHED_FOLDER, "watched.txt"), "x");

  $effect(() => {
    const watcher = watch(WATCHED_FOLDER, () => undefined);
    report({
      kind: "ready",
      isLinked: channel !== undefined
    });
    return () => watcher.close();
  });
</script>

<Window
  backdrop={Backdrop.mica}
  height={WINDOW_HEIGHT}
  onclosed={() => exitApplication()}
  title="Relay example"
  width={WINDOW_WIDTH}
>
  {#if settings.isDarkTheme}
    <TextBlock>dark</TextBlock>
  {:else}
    <TextBlock>light</TextBlock>
  {/if}
</Window>

<TrayIcon
  guid={GUID}
  icon={{
    forLightTaskbar: ICON,
    forDarkTaskbar: ICON
  }}
  tooltip="Relay example"
/>
