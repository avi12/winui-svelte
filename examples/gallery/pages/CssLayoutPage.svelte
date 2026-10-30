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
      <Border class="css-chip"><TextBlock text={chip} /></Border>
    {/each}
  </StackPanel>
  <Canvas class="css-stage">
    <Border class="css-pin"><TextBlock text="position: absolute" /></Border>
  </Canvas>
  <StackPanel class="css-responsive">
    <TextBlock text="Wider than 700 px: more padding and a new colour" />
  </StackPanel>
  <StackPanel class="css-card-host">
    <Border class="css-badge"><TextBlock text="A container query decides this badge" /></Border>
  </StackPanel>
  <Border class="css-colours"><TextBlock text="oklch, color-mix and relative colour" /></Border>
</PageFrame>

<style>
  :root {
    --css-base: oklch(70% 0.15 200deg);
  }

  :global(.css-flex) {
    display: flex;
    gap: 8px;
  }

  :global(.css-chip) {
    padding: 8px 12px;
    border-radius: 6px;
    background-color: color-mix(in oklch, var(--css-base) 40%, #ffffff);
  }

  :global(.css-stage) {
    height: 64px;
  }

  :global(.css-pin) {
    position: absolute;
    top: 12px;
    left: 24px;
    padding: 8px;
    background-color: rgb(from var(--css-base) r g b / 50%);
  }

  :global(.css-responsive) {
    padding: 8px;
    background-color: #d5e4f0;
    color: #06182b;
  }

  @media (width >= 700px) {
    :global(.css-responsive) {
      padding: 24px;
      background-color: oklch(85% 0.1 150deg);
    }
  }

  :global(.css-card-host) {
    container-name: card;
    container-type: inline-size;
  }

  :global(.css-badge) {
    padding: 8px;
    background-color: #d5e4f0;
    color: #06182b;
  }

  @container card (min-width: 500px) {
    :global(.css-badge) {
      padding: 20px;
      background-color: oklch(80% 0.12 60deg);
    }
  }

  :global(.css-colours) {
    width: calc(10rem + 80px);
    padding: 12px;
    background-color: color-mix(in oklch, oklch(60% 0.2 30deg), oklch(60% 0.2 250deg));
  }
</style>
