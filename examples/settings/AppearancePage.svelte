<script lang="ts">
  import { preferences } from "./preferences.svelte.ts";
  import SettingsPage from "./SettingsPage.svelte";
  import { Button, Slider, StackPanel, TextBlock } from "winui-svelte/components";
  import { Backdrop, WindowTheme } from "winui-svelte/enums";

  const MINIMUM_TEXT_SIZE = 10;
  const MAXIMUM_TEXT_SIZE = 28;
</script>

<SettingsPage>
  <TextBlock>Theme: {preferences.theme}</TextBlock>
  <StackPanel class="row">
    {#each Object.values(WindowTheme) as theme (theme)}
      <Button onclick={() => (preferences.theme = theme)}>{theme}</Button>
    {/each}
  </StackPanel>
  <TextBlock>Material: {preferences.backdrop}</TextBlock>
  <StackPanel class="row">
    {#each Object.values(Backdrop) as backdrop (backdrop)}
      <Button onclick={() => (preferences.backdrop = backdrop)}>{backdrop}</Button>
    {/each}
  </StackPanel>
  <Slider
    header="Text size: {preferences.textSize}"
    maximum={MAXIMUM_TEXT_SIZE}
    minimum={MINIMUM_TEXT_SIZE}
    bind:value={preferences.textSize}
  />
  <TextBlock style:font-size="{preferences.textSize}px">Sample text at {preferences.textSize} pixels</TextBlock>
</SettingsPage>

<style>
  .row {
    display: flex;
    flex-direction: row;
    gap: 6px;
  }
</style>
