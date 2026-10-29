<script lang="ts">
  // Svelte's own directives and helpers on stand-in controls, for
  // element-animation.test.ts: one element for each transition, a keyed list
  // that flips, and two panels an element crosses between.
  import { flip } from "svelte/animate";
  import {
    blur,
    crossfade,
    draw,
    fade,
    fly,
    scale,
    slide
  } from "svelte/transition";

  const DURATION = 100;
  const FLY_DISTANCE = 20;
  const fadeParams = { duration: DURATION };
  const flyParams = {
    y: FLY_DISTANCE,
    duration: DURATION
  };
  const [send, receive] = crossfade({ duration: DURATION });
  const crossing = { key: "card" };

  interface Props {
    isShown: boolean;
    isSliding: boolean;
    isFlying: boolean;
    isScaling: boolean;
    isBlurring: boolean;
    isDrawing: boolean;
    isOnTheLeft: boolean;
    ids: number[];
  }

  const props: Props = $props();
</script>

<fake-motion-panel>
  {#if props.isShown}
    <fake-motion-panel transition:fade={fadeParams}></fake-motion-panel>
  {/if}
  {#if props.isSliding}
    <fake-motion-panel transition:slide={fadeParams}></fake-motion-panel>
  {/if}
  {#if props.isFlying}
    <fake-motion-panel out:fly={flyParams}></fake-motion-panel>
  {/if}
  {#if props.isScaling}
    <fake-motion-panel in:scale={fadeParams}></fake-motion-panel>
  {/if}
  {#if props.isBlurring}
    <fake-motion-panel in:blur={fadeParams}></fake-motion-panel>
  {/if}
  {#if props.isDrawing}
    <line in:draw={fadeParams}></line>
  {/if}
  <fake-motion-panel>
    {#each props.ids as id (id)}
      <fake-motion-panel animate:flip={fadeParams}></fake-motion-panel>
    {/each}
  </fake-motion-panel>
  <fake-motion-panel>
    {#if props.isOnTheLeft}
      <fake-motion-panel in:receive={crossing} out:send={crossing}></fake-motion-panel>
    {/if}
  </fake-motion-panel>
  <fake-motion-panel>
    {#if !props.isOnTheLeft}
      <fake-motion-panel in:receive={crossing} out:send={crossing}></fake-motion-panel>
    {/if}
  </fake-motion-panel>
</fake-motion-panel>
