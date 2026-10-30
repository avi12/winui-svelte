<script lang="ts">
  import DemoWindow from "#examples/gallery/DemoWindow.svelte";
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { shell } from "#examples/gallery/shell.svelte.ts";
  import { keyControl } from "#examples/harness/smoke.ts";
  import {
    Button,
    CheckBox,
    StackPanel,
    TextBlock,
    TextBox
  } from "winui-svelte/components";
  import { Backdrop, createWindow, WindowPresentation, WindowTheme } from "winui-svelte/window";

  const SECOND_WIDTH = 360;
  const SECOND_HEIGHT = 200;

  function openSecond() {
    createWindow({
      component: DemoWindow,
      props: {
        message: shell.title
      },
      title: "Second window",
      size: {
        width: SECOND_WIDTH,
        height: SECOND_HEIGHT
      },
      backdrop: Backdrop.acrylic
    });
  }
</script>

<PageFrame
  caption="The window is a component: its title, material, theme and presentation are props, so they are state like any other."
  title="Window"
>
  <StackPanel class="window-block">
    <TextBox {@attach keyControl("window")} header="Title" bind:text={shell.title} />
    <TextBlock text="Backdrop: {shell.backdrop}" />
    <StackPanel class="window-row" orientation="Horizontal">
      {#each Object.values(Backdrop) as backdrop (backdrop)}
        <Button onclick={() => (shell.backdrop = backdrop)}>{backdrop}</Button>
      {/each}
    </StackPanel>
    <TextBlock text="Theme: {shell.theme}" />
    <StackPanel class="window-row" orientation="Horizontal">
      {#each Object.values(WindowTheme) as theme (theme)}
        <Button onclick={() => (shell.theme = theme)}>{theme}</Button>
      {/each}
    </StackPanel>
    <TextBlock text="Presentation: {shell.presentation}" />
    <StackPanel class="window-row" orientation="Horizontal">
      {#each Object.values(WindowPresentation) as presentation (presentation)}
        <Button onclick={() => (shell.presentation = presentation)}>{presentation}</Button>
      {/each}
    </StackPanel>
    <CheckBox bind:isChecked={shell.isCloseBlocked}>Refuse to close (onclosing returns true)</CheckBox>
    <Button onclick={openSecond}>Open a second window</Button>
  </StackPanel>
</PageFrame>

<style>
  :global(.window-block) {
    gap: 8px;
  }

  :global(.window-row) {
    gap: 6px;
  }
</style>
