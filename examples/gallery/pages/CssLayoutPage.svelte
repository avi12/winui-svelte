<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import { Border, Canvas, StackPanel, TextBlock } from "winui-svelte/components";

  const CHIPS = ["One", "Two", "Three", "Four"];
</script>

<PageFrame
  caption="The layout is CSS: flex and grid become panels, position becomes a canvas place, media and container queries restyle as the window resizes, and selectors that need the markup are resolved at build time."
  title="CSS layout"
>
  <StackPanel class="css-flex" {@attach keyControl("css-layout")}>
    {#each CHIPS as chip (chip)}
      <Border class="css-chip"><TextBlock>{chip}</TextBlock></Border>
    {/each}
  </StackPanel>
  <Canvas class="css-stage">
    <Border class="css-pin"><TextBlock>position: absolute</TextBlock></Border>
  </Canvas>
  <StackPanel class="css-responsive">
    <TextBlock>Wider than 700 px: more padding and a new colour</TextBlock>
  </StackPanel>
  <StackPanel class="css-card-host">
    <Border class="css-badge"><TextBlock>A container query decides this badge</TextBlock></Border>
  </StackPanel>
  <Border class="css-colours"><TextBlock>oklch, color-mix and relative colour</TextBlock></Border>
</PageFrame>

<style>
  :root {
    --css-base: oklch(0.7 0.15 200deg);
  }

  .css-flex {
    display: flex;
    gap: 8px;
  }

  .css-chip {
    padding: 8px 12px;
    border-radius: 6px;
    background-color: color-mix(in oklch, oklch(0.7 0.15 200deg) 40%, #ffffff);
  }

  .css-stage {
    height: 64px;
  }

  .css-pin {
    position: absolute;
    top: 12px;
    left: 24px;
    padding: 8px;
    background-color: rgb(from var(--css-base) r g b / 0.5);
  }

  .css-responsive {
    padding: 8px;
    background-color: #d5e4f0;

    @media (width >= 700px) {
      padding: 24px;
      background-color: oklch(0.85 0.1 150deg);
    }
  }

  .css-card-host {
    container-name: card;
    container-type: inline-size;
  }

  .css-badge {
    padding: 8px;
    background-color: #d5e4f0;

    @container card (min-width: 500px) {
      padding: 20px;
      background-color: oklch(0.8 0.12 60deg);
    }
  }

  .css-colours {
    width: calc(160px + 80px);
    padding: 12px;
    background-color: color-mix(in oklch, oklch(0.6 0.2 30deg), oklch(0.6 0.2 250deg));
  }
</style>
