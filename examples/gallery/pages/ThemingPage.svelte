<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { onOff, themeOf } from "#examples/gallery/pages/words.ts";
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
  <StackPanel class="theme-block" {@attach theme.attach} requestedTheme={themeOf(isDark)}>
    <ToggleSwitch header="Dark" bind:isOn={isDark} />
    <TextBlock>The panel is {theme.current ?? "..."}</TextBlock>
    <Border class="theme-gradient" {@attach keyControl("theming")}><TextBlock>A gradient from CSS</TextBlock></Border>
    <Border class="theme-elevated"><TextBlock>Lifted by a ThemeShadow</TextBlock></Border>
    <Button>Default button</Button>
    <Button class="theme-danger">Scoped override</Button>
    <TextBlock>Accent {settings.accentColor}, high contrast {onOff(settings.isHighContrast)}</TextBlock>
  </StackPanel>
</PageFrame>

<style>
  :root {
    --theme-card: #ffffff;

    @media (prefers-color-scheme: dark) {
      --theme-card: #202020;
    }

    @media (forced-colors: active) {
      --theme-card: Canvas;
    }
  }

  .theme-block {
    gap: 8px;
    padding: 12px;
    background-color: var(--theme-card);
  }

  .theme-gradient {
    padding: 16px;
    border-radius: 6px;
    background-image: linear-gradient(to right, #00e5ff, #06182b);
  }

  .theme-elevated {
    padding: 16px;
    /* stylelint-disable-next-line winui-svelte/no-unsupported-css -- accepted ThemeShadow caveat */
    -winui-elevation: 16px;
  }

  .theme-danger {
    --button-background: #c42b1c;
    --button-background-pointer-over: #a32315;
  }
</style>
