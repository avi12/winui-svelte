<script lang="ts">
  import { LANGUAGES, preferences } from "./preferences.svelte.ts";
  import SettingsPage from "./SettingsPage.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import { ComboBox, ComboBoxItem, TextBox, ToggleSwitch } from "winui-svelte/components";
</script>

<SettingsPage>
  <TextBox {@attach keyControl("settings")} header="Your name" bind:text={preferences.userName} />
  <ComboBox header="Language" bind:selectedIndex={preferences.language}>
    {#each LANGUAGES as language (language)}
      <ComboBoxItem>{language}</ComboBoxItem>
    {/each}
  </ComboBox>
  <ToggleSwitch header="Start with Windows" bind:isOn={preferences.isStartupEnabled} />
  <ToggleSwitch header="Share usage data" bind:isOn={preferences.isTelemetryEnabled} />
</SettingsPage>
