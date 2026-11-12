<script lang="ts">
  import type { SelectionOverlayProps } from "./selection-overlay-props.ts";
  import Border from "#src/components/generated/Border.svelte";
  import Canvas from "#src/components/generated/Canvas.svelte";
  import Grid from "#src/components/generated/Grid.svelte";
  import Image from "#src/components/generated/Image.svelte";
  import Path from "#src/components/generated/Path.svelte";
  import Polyline from "#src/components/generated/Polyline.svelte";
  import {
    bracketPath,
    DEFAULT_BRACKET_ARM,
    DEFAULT_SELECTION_RADIUS,
    pointsText,
    scrimPath
  } from "#src/selection/overlay-geometry.js";
  import { SelectionPhase } from "#src/selection/selector.js";

  // A frozen picture under a dim scrim with the selection cut out of it,
  // corner brackets and an accent edge on the selection, and the loop being
  // drawn with a soft glow. It only draws: it takes no pointer, so the page
  // feeds the selector and passes its state here.
  const props: SelectionOverlayProps = $props();
  const view = $derived.by(() => {
    const { selection } = props.state;
    const radius = props.radius ?? DEFAULT_SELECTION_RADIUS;
    const isDrawing = props.state.phase === SelectionPhase.draw;
    const scrim = scrimPath({
      screen: props.state.bounds,
      selection,
      radius
    });
    const stroke = pointsText(props.state.stroke);
    const isUnselected = selection === undefined;
    if (isUnselected) {
      return {
        scrim,
        brackets: "",
        stroke,
        isDrawing
      };
    }

    return {
      scrim,
      brackets: bracketPath({
        size: selection,
        arm: props.arm ?? DEFAULT_BRACKET_ARM,
        radius
      }),
      stroke,
      isDrawing
    };
  });
</script>

<Grid class="overlay" isHitTestVisible={false}>
  {#if props.image !== undefined}
    <Image source={props.image} stretch="Fill" />
  {/if}
  <Path class="scrim" class:selected={props.state.selection !== undefined} data={view.scrim} />
  <Canvas class="layer">
    {#if props.state.selection !== undefined}
      <Border
        style:left="{props.state.selection.x}px"
        style:top="{props.state.selection.y}px"
        style:width="{props.state.selection.width}px"
        style:height="{props.state.selection.height}px"
        class="selection"
      >
        <Path class="bracket" data={view.brackets} />
      </Border>
    {/if}
    <Canvas class="layer stroke" class:drawing={view.isDrawing}>
      <Polyline class="stroke-glow" points={view.stroke} />
      <Polyline class="stroke-core" points={view.stroke} />
    </Canvas>
  </Canvas>
</Grid>

<style>
  .overlay {
    background-color: transparent;
  }

  .scrim {
    fill: #000000;
    opacity: 0.35;
    transition: opacity 200ms;
  }

  .selected {
    opacity: 0.6;
  }

  .layer {
    width: 100%;
    height: 100%;
  }

  .selection {
    position: absolute;
    border-color: var(--accent-fill-color-default);
    border-width: 2px;
    border-radius: 24px;
    animation: selection-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .bracket {
    fill: none;
    stroke: #ffffff;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 5px;
    animation: bracket-in 260ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .stroke {
    opacity: 0;
    transition: opacity 260ms;
  }

  .drawing {
    opacity: 1;
  }

  .stroke-glow {
    stroke: var(--accent-fill-color-default);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 20px;
    opacity: 0.85;
    filter: blur(12px);
  }

  .stroke-core {
    stroke: #ffffff;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 6px;
  }

  @keyframes selection-in {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  @keyframes bracket-in {
    from {
      opacity: 0;
      scale: 1.08;
    }

    to {
      opacity: 1;
      scale: 1;
    }
  }
</style>
