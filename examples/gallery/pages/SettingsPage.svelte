<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import {
    ComboBox,
    ComboBoxItem,
    StackPanel,
    TextBlock,
    ToggleSwitch
  } from "winui-svelte/components";
  import { SettingsCard, SettingsExpander } from "winui-svelte/settings";

  const THEMES = ["Light", "Dark", "Use system setting"];

  let isStartupOn = $state(true);
  let isExpanded = $state(true);
  let theme = $state(2);
  let openedCount = $state(0);
</script>

<PageFrame
  caption="SettingsCard and SettingsExpander, after the Community Toolkit's: an icon, a name, a description, the control on the right"
  title="Settings cards"
>
  <StackPanel class="cards" {@attach keyControl("settings-cards")}>
    <SettingsCard description="Start with Windows, in the tray" header="Run at startup" headerIcon="PowerButton">
      <ToggleSwitch bind:isOn={isStartupOn} />
    </SettingsCard>
    <SettingsCard
      description="Opens the log folder"
      header="Open the logs"
      headerIcon="Document"
      isClickEnabled
      onclick={() => {
        openedCount++;
      }}
    />
    <SettingsExpander description="Colors and text" header="Appearance" headerIcon="Color" bind:isExpanded>
      {#snippet items()}
        <SettingsCard header="Theme">
          <ComboBox bind:selectedIndex={theme}>
            {#each THEMES as label (label)}
              <ComboBoxItem content={label} />
            {/each}
          </ComboBox>
        </SettingsCard>
        <SettingsCard description="Applies on the next start" header="Compact spacing">
          <ToggleSwitch />
        </SettingsCard>
      {/snippet}
    </SettingsExpander>
    <TextBlock>The logs card was clicked {openedCount} times, the theme is {THEMES[theme]}</TextBlock>
  </StackPanel>
</PageFrame>

<style>
  .cards {
    gap: 4px;
    max-width: 640px;
  }
</style>
