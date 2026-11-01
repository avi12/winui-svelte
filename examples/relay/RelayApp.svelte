<script lang="ts">
  import { writeIconFile } from "#examples/tray/icon-file.ts";
  import { mkdtempSync, watch, writeFileSync } from "node:fs";
  import { tmpdir } from "node:os";
  import path from "node:path";
  import {
    Border,
    Button,
    GridView,
    StackPanel,
    TextBlock,
    Window
  } from "winui-svelte/components";
  import type { HostChannel } from "winui-svelte/state";
  import { TrayIcon } from "winui-svelte/tray";
  import { Backdrop, exitApplication, systemSettings } from "winui-svelte/window";

  const GUID = "0b8d1f0e-3b8a-4e0b-9a43-5c8b0f6d2a71";
  const SWATCHES = ["a", "b", "c"];
  const SWATCH_WIDTH = 120;
  const SWATCH_HEIGHT = 132;
  const SWATCH_CUT = 20;
  const SWATCH_CLIP = `polygon(0 0, ${SWATCH_WIDTH}px 0, ${SWATCH_WIDTH}px ${SWATCH_HEIGHT - SWATCH_CUT}px, ${SWATCH_WIDTH - SWATCH_CUT}px ${SWATCH_HEIGHT}px, 0 ${SWATCH_HEIGHT}px)`;
  const BLUE = 160;
  const WINDOW_WIDTH = 1080;
  const WINDOW_HEIGHT = 980;
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
  <StackPanel>
    {#if settings.isDarkTheme}
      <TextBlock>dark</TextBlock>
    {:else}
      <TextBlock>light</TextBlock>
    {/if}
    <GridView itemName={name => name} items={SWATCHES} key={name => name}>
      {#snippet item()}
        <Border style:clip-path={SWATCH_CLIP} background="#444" height={SWATCH_HEIGHT} width={SWATCH_WIDTH} />
      {/snippet}
    </GridView>
    <Button automationId="quit" onclick={() => exitApplication()}>Quit</Button>
  </StackPanel>
</Window>

<TrayIcon
  guid={GUID}
  icon={{
    forLightTaskbar: ICON,
    forDarkTaskbar: ICON
  }}
  tooltip="Relay example"
/>
