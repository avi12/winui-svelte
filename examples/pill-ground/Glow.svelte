<script lang="ts">
  import { GlowMode } from "./pill-view.ts";
  import { view } from "./view.svelte.ts";

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
  GAP: the blur draws up to three radii outside the element, and the window is
  not transparent (API.md, Window), so what leaves the window is clipped and
  the part under the pill's edge shows the window's solid color
-->
<border style:opacity={glow.opacity} class="glow" {@attach breathe}></border>

<style>
  .glow {
    height: 14px;
    margin-top: -10px;
    margin-right: 24px;
    margin-left: 24px;
    background-image: linear-gradient(to right, #4285f4, #9b72cb, #d96570, #f9ab00);
    filter: blur(24px);
  }
</style>
