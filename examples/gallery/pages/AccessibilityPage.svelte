<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import { Border, StackPanel, TextBlock, ToggleSwitch } from "winui-svelte/components";
  import { mediaQuery, systemSettings } from "winui-svelte/window";

  let isDark = $state(false);
  const settings = systemSettings();
  const isReducedMotion = mediaQuery("(prefers-reduced-motion: reduce)");
  const isContrastMore = mediaQuery("(prefers-contrast: more)");
  const isNarrow = mediaQuery("(max-width: 900px)");
  const PERCENT = 100;
</script>

<PageFrame
  caption="The library follows Windows: the theme, the contrast theme, animation effects and transparency. The same media queries work in a stylesheet and in script."
  title="Accessibility and theming"
>
  <StackPanel class="access-block" requestedTheme={isDark ? "Dark" : "Light"}>
    <ToggleSwitch header="Force this panel dark (color-scheme)" bind:isOn={isDark} />
    <Border class="access-card" {@attach keyControl("accessibility")}><TextBlock class="access-card-text" text="This card follows prefers-color-scheme, forced-colors and prefers-contrast" /></Border>
    <Border class="access-pulse"><TextBlock text="Pulses, unless animation effects are off in Windows" /></Border>
    <Border class="access-glass"><TextBlock text="Opaque when transparency effects are off" /></Border>
  </StackPanel>
  <StackPanel class="access-block">
    <TextBlock text="Dark mode {settings.isDarkTheme ? "on" : "off"}" />
    <TextBlock text="High contrast {settings.isHighContrast ? "on" : "off"} (prefers-contrast: more {isContrastMore.matches ? "holds" : "does not"})" />
    <TextBlock text="Animation effects {settings.isAnimationEnabled ? "on" : "off"} (prefers-reduced-motion: reduce {isReducedMotion.matches ? "holds" : "does not"})" />
    <TextBlock text="Transparency effects {settings.isTransparencyEnabled ? "on" : "off"}" />
    <TextBlock text="Text size {Math.round(settings.textScaleFactor * PERCENT)} percent" />
    <TextBlock text="Narrow monitor (max-width: 900px) {isNarrow.matches ? "holds" : "does not"}" />
  </StackPanel>
</PageFrame>

<style>
  :root {
    --access-card: #ffffff;
    --access-card-text: #06182b;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --access-card: #202020;
      --access-card-text: #ffffff;
    }
  }

  @media (forced-colors: active) {
    :root {
      --access-card: Canvas;
      --access-card-text: CanvasText;
    }
  }

  :global(.access-block) {
    gap: 8px;
    padding: 12px;
  }

  :global(.access-card) {
    padding: 16px;
    background-color: var(--access-card);
  }

  :global(.access-card-text) {
    color: var(--access-card-text);
  }

  :global(.access-pulse) {
    padding: 16px;
    background-color: #0078d4;
    animation: access-pulse 1200ms infinite alternate;
  }

  :global(.access-glass) {
    padding: 16px;
    background-color: rgb(128 128 128 / 50%);
  }

  @media (prefers-reduced-transparency: reduce) {
    :global(.access-glass) {
      background-color: var(--access-card);
    }
  }

  @media (prefers-contrast: more) {
    :global(.access-card) {
      border-color: var(--access-card-text);
      border-width: 2px;
    }
  }

  @keyframes access-pulse {
    from {
      opacity: 40%;
    }

    to {
      opacity: 100%;
    }
  }
</style>
