<script lang="ts">
  // Transitions for element-animation.test.ts: an element that fades in and
  // out, one that slides, one that flies out and one that scales in.
  import { intro, outro, transition } from "#src/renderer/host/element-animation.js";
  import { fade, fly, scale, slide } from "svelte/transition";

  const DURATION = 100;
  const FLY_DISTANCE = 20;
  const fadeParams = { duration: DURATION };
  const flyParams = {
    y: FLY_DISTANCE,
    duration: DURATION
  };

  interface Props {
    isShown: boolean;
    isSliding: boolean;
    isFlying: boolean;
    isScaling: boolean;
  }

  const props: Props = $props();
</script>

<fake-motion-panel>
  {#if props.isShown}
    <fake-motion-panel
      {@attach transition({
        use: fade,
        params: fadeParams
      })}
    ></fake-motion-panel>
  {/if}
  {#if props.isSliding}
    <fake-motion-panel
      {@attach transition({
        use: slide,
        params: fadeParams
      })}
    ></fake-motion-panel>
  {/if}
  {#if props.isFlying}
    <fake-motion-panel
      {@attach outro({
        use: fly,
        params: flyParams
      })}
    ></fake-motion-panel>
  {/if}
  {#if props.isScaling}
    <fake-motion-panel
      {@attach intro({
        use: scale,
        params: fadeParams
      })}
    ></fake-motion-panel>
  {/if}
</fake-motion-panel>
