<script lang="ts">
  import { GlowMode, PillSize } from "./pill-view.ts";
  import { view } from "./view.svelte.ts";
  import type { Snippet } from "svelte";

  const { children }: { children: Snippet } = $props();

  const REST_OPACITY = 0.25;
  const MAX_OPACITY = 1;
  const BREATH_MILLISECONDS = 2400;

  const glow = $derived.by(() => {
    const isLevel = view.glow.mode === GlowMode.level;
    const isBreathing = view.glow.mode === GlowMode.breathe;
    if (isLevel) {
      return {
        isBreathing,
        opacity: REST_OPACITY + view.glow.level * (MAX_OPACITY - REST_OPACITY)
      };
    }

    return {
      isBreathing,
      opacity: REST_OPACITY
    };
  });

  // The breathing is the Web Animations API: `element.animate()` from
  // installAnimations() (winui-svelte/web-apis/animations), which main.ts
  // installs. It runs on the element's Opacity, so no timer writes frames
  function breathe(node: HTMLElement) {
    if (!glow.isBreathing) {
      return;
    }

    const animation = node.animate(
      [{ opacity: REST_OPACITY }, { opacity: MAX_OPACITY }],
      {
        duration: BREATH_MILLISECONDS,
        iterations: Infinity,
        direction: "alternate",
        easing: "ease-in-out"
      }
    );
    return () => animation.cancel();
  }
</script>

<!--
  Gemini's glow: a blue, violet, pink and yellow band under the pill's bottom
  edge, blurred by 24. `background-image: linear-gradient(to right, ...)` is
  exact, and `filter: blur(24px)` is a Gaussian blur of the element's
  Composition visual through Win2D (css/filter; API.md "Filters")
  A level that follows each speaker's audio is data: `view.glow.level` arrives
  from the host and sets the opacity below, and when the host sends levels at
  60 fps the write is the whole job. If the app has to produce frames itself,
  use `requestAnimationFrame` (installTiming), not `startTimer`
  The window is transparent, so the blur bleeds past the pill onto the
  desktop; it draws up to three radii outside the band, so the room under the
  pill (`PillSize.glowRoom`) is part of the window's content. The band comes
  first in the grid, so the pill is drawn over it
-->
<grid style:grid-template-rows="auto {PillSize.glowRoom}px" class="glow-and-pill">
  <border style:opacity={glow.opacity} class="glow" {@attach breathe}></border>
  {@render children()}
</grid>

<style>
  .glow-and-pill {
    display: grid;
  }

  .glow {
    grid-row: 2;
    height: 14px;
    margin-top: -10px;
    margin-right: 24px;
    margin-left: 24px;
    background-image: linear-gradient(to right, #4285f4, #9b72cb, #d96570, #f9ab00);
    filter: blur(24px);
  }
</style>
