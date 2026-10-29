<script lang="ts">
  import { LANGUAGES, preferences } from "./preferences.svelte.ts";
  import { keyControl } from "#examples/harness/smoke.ts";
  import {
    ComboBox,
    ComboBoxItem,
    StackPanel,
    TextBox,
    ToggleSwitch
  } from "winui-svelte/components";
</script>

<StackPanel class="settings-page">
  <TextBox {@attach keyControl("settings")} header="Your name" bind:text={preferences.userName} />
  <ComboBox header="Language" bind:selectedIndex={preferences.language}>
    {#each LANGUAGES as language (language)}
      <ComboBoxItem content={language} />
    {/each}
  </ComboBox>
  <ToggleSwitch header="Start with Windows" bind:isOn={preferences.isStartupEnabled} />
  <ToggleSwitch header="Share usage data" bind:isOn={preferences.isTelemetryEnabled} />
</StackPanel>
