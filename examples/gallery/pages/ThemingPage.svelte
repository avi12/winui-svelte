<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import { elementTheme } from "winui-svelte";
  import {
    Border,
    Button,
    StackPanel,
    TextBlock,
    ToggleSwitch
  } from "winui-svelte/components";
  import { systemSettings } from "winui-svelte/window";

  let isDark = $state(false);
  const theme = elementTheme();
  const settings = systemSettings();
</script>

<PageFrame
  caption="Classes become WinUI styles. A custom property on a class is a resource only that element sees, and the dark and high contrast values follow Windows."
  title="Theming and CSS"
>
  <StackPanel class="theme-block" {@attach theme.attach} requestedTheme={isDark ? "Dark" : "Light"}>
    <ToggleSwitch header="Dark" bind:isOn={isDark} />
    <TextBlock text="The panel is {theme.current ?? "..."}" />
    <Border class="theme-gradient" {@attach keyControl("theming")}><TextBlock text="A gradient from CSS" /></Border>
    <Button>Default button</Button>
    <Button class="theme-danger">Scoped override</Button>
    <TextBlock text="Accent {settings.accentColor}, high contrast {settings.isHighContrast ? "on" : "off"}" />
  </StackPanel>
</PageFrame>

<style>
  :root {
    --theme-card: #ffffff;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --theme-card: #202020;
    }
  }

  @media (forced-colors: active) {
    :root {
      --theme-card: Canvas;
    }
  }

  :global(.theme-block) {
    gap: 8px;
    padding: 12px;
    background-color: var(--theme-card);
  }

  :global(.theme-gradient) {
    padding: 16px;
    border-radius: 6px;
    background-image: linear-gradient(to right, #00e5ff, #06182b);
  }

  :global(.theme-danger) {
    --button-background: #c42b1c;
    --button-background-pointer-over: #a32315;
  }
</style>
