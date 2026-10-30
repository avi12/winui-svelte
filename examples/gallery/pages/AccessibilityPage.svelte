<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { holds, onOff, themeOf } from "#examples/gallery/pages/words.ts";
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
  <StackPanel class="access-block" requestedTheme={themeOf(isDark)}>
    <ToggleSwitch header="Force this panel dark (color-scheme)" bind:isOn={isDark} />
    <Border class="access-card" {@attach keyControl("accessibility")}>
      <TextBlock class="access-card-text">
        This card follows prefers-color-scheme, forced-colors and prefers-contrast
      </TextBlock>
    </Border>
    <Border class="access-pulse"><TextBlock>Pulses, unless animation effects are off in Windows</TextBlock></Border>
    <Border class="access-glass"><TextBlock>Opaque when transparency effects are off</TextBlock></Border>
  </StackPanel>
  <StackPanel class="access-block">
    <TextBlock>Dark mode {onOff(settings.isDarkTheme)}</TextBlock>
    <TextBlock>
      High contrast {onOff(settings.isHighContrast)} (prefers-contrast: more {holds(isContrastMore.matches)})
    </TextBlock>
    <TextBlock>
      Animation effects {onOff(settings.isAnimationEnabled)}
      (prefers-reduced-motion: reduce {holds(isReducedMotion.matches)})
    </TextBlock>
    <TextBlock>Transparency effects {onOff(settings.isTransparencyEnabled)}</TextBlock>
    <TextBlock>Text size {Math.round(settings.textScaleFactor * PERCENT)} percent</TextBlock>
    <TextBlock>Narrow monitor (max-width: 900px) {holds(isNarrow.matches)}</TextBlock>
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

  .access-block {
    gap: 8px;
    padding: 12px;
  }

  .access-card {
    padding: 16px;
    background-color: var(--access-card);
  }

  .access-card-text {
    color: var(--access-card-text);
  }

  .access-pulse {
    padding: 16px;
    background-color: #0078d4;
    animation: access-pulse 1200ms infinite alternate;
  }

  .access-glass {
    padding: 16px;
    background-color: rgb(128 128 128 / 0.5);
  }

  @media (prefers-reduced-transparency: reduce) {
    .access-glass {
      background-color: var(--access-card);
    }
  }

  @media (prefers-contrast: more) {
    .access-card {
      border-color: var(--access-card-text);
      border-width: 2px;
    }
  }

  @keyframes access-pulse {
    from {
      opacity: 0.4;
    }

    to {
      opacity: 1;
    }
  }
</style>
