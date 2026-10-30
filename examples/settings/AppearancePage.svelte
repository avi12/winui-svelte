<script lang="ts">
  import { preferences } from "./preferences.svelte.ts";
  import { Button, Slider, StackPanel, TextBlock } from "winui-svelte/components";
  import { Backdrop, WindowTheme } from "winui-svelte/window";

  const MINIMUM_TEXT_SIZE = 10;
  const MAXIMUM_TEXT_SIZE = 28;
</script>

<StackPanel class="settings-page">
  <TextBlock text="Theme: {preferences.theme}" />
  <StackPanel class="settings-row" orientation="Horizontal">
    {#each Object.values(WindowTheme) as theme (theme)}
      <Button onclick={() => (preferences.theme = theme)}>{theme}</Button>
    {/each}
  </StackPanel>
  <TextBlock text="Material: {preferences.backdrop}" />
  <StackPanel class="settings-row" orientation="Horizontal">
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
  <TextBlock fontSize={preferences.textSize} text="Sample text at {preferences.textSize} pixels" />
</StackPanel>
