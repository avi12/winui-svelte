<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import { flip } from "svelte/animate";
  import { fade, fly } from "svelte/transition";
  import { Button, StackPanel, TextBlock, ToggleSwitch } from "winui-svelte/components";

  const FLY_DISTANCE = 32;
  const TRANSITION_MILLISECONDS = 300;
  const FLIP_MILLISECONDS = 250;
  const HALF = 1 / 2;

  let isShown = $state(true);
  let tiles = $state([
    {
      id: 1,
      label: "One"
    },
    {
      id: 2,
      label: "Two"
    },
    {
      id: 3,
      label: "Three"
    }
  ]);

  function shuffle() {
    tiles = tiles.toSorted(() => Math.random() - HALF);
  }
</script>

<PageFrame
  caption="Svelte's own directives run on WinUI controls: transition:, in:, out: and animate: on a raw element. CSS animation and @keyframes run as a Storyboard."
  title="Animation and transitions"
>
  <ToggleSwitch header="Show the card" bind:isOn={isShown} />
  <StackPanel class="anim-stage">
    {#if isShown}
      <border
        class="anim-card"
        {@attach keyControl("animation")}
        in:fly={{
          y: FLY_DISTANCE,
          duration: TRANSITION_MILLISECONDS
        }}
        out:fade={{
          duration: TRANSITION_MILLISECONDS
        }}
      >
        <text-block text="Flies in, fades out"></text-block>
      </border>
    {/if}
  </StackPanel>
  <Button onclick={shuffle}>Shuffle the tiles</Button>
  <StackPanel class="anim-row">
    {#each tiles as tile (tile.id)}
      <border class="anim-tile" animate:flip={{ duration: FLIP_MILLISECONDS }}>
        <text-block text={tile.label}></text-block>
      </border>
    {/each}
  </StackPanel>
  <TextBlock class="anim-pulse" text="A CSS keyframes animation" />
</PageFrame>

<style>
  :global(.anim-stage) {
    min-height: 56px;
  }

  :global(.anim-card),
  :global(.anim-tile) {
    padding: 12px;
    border-radius: 6px;
    background-color: #00e5ff;
  }

  :global(.anim-row) {
    display: flex;
    gap: 8px;
  }

  @keyframes pulse {
    0% {
      opacity: 1;
    }

    50% {
      opacity: 0.35;
    }

    100% {
      opacity: 1;
    }
  }

  :global(.anim-pulse) {
    animation: pulse 1400ms ease-in-out infinite;
  }
</style>
