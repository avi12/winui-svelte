<script lang="ts">
  import type { SelectionOverlayProps } from "./selection-overlay-props.ts";
  import Border from "#src/components/generated/Border.svelte";
  import Canvas from "#src/components/generated/Canvas.svelte";
  import Ellipse from "#src/components/generated/Ellipse.svelte";
  import Grid from "#src/components/generated/Grid.svelte";
  import Image from "#src/components/generated/Image.svelte";
  import Path from "#src/components/generated/Path.svelte";
  import Polyline from "#src/components/generated/Polyline.svelte";
  import {
    bracketPath,
    DEFAULT_BRACKET_ARM,
    DEFAULT_HANDLE_SIZE,
    DEFAULT_SCRIM_OPACITY,
    DEFAULT_SELECTED_SCRIM_OPACITY,
    DEFAULT_SELECTION_RADIUS,
    handlePoints,
    pointsText,
    scrimPath
  } from "#src/selection/overlay-geometry.js";
  import { SelectionPhase } from "#src/selection/selector.js";

  // Colours are custom properties (--selection-*), declared on :root below
  // as the defaults; opacity and size are props because WinUI's CSS takes no
  // var() for them. A frozen picture under a dim scrim with the selection cut out of it,
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
    const handleSize = props.handleSize ?? DEFAULT_HANDLE_SIZE;
    const scrimOpacity = props.state.selection === undefined
      ? props.scrimOpacity ?? DEFAULT_SCRIM_OPACITY
      : props.selectedScrimOpacity ?? DEFAULT_SELECTED_SCRIM_OPACITY;
    const isUnselected = selection === undefined;
    if (isUnselected) {
      return {
        scrim,
        scrimOpacity,
        brackets: "",
        handles: [],
        handleSize,
        stroke,
        isDrawing
      };
    }

    return {
      scrim,
      scrimOpacity,
      handles: handlePoints(selection),
      handleSize,
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
    <Image
      onimagefailed={(_, args) => props.onimagefailed?.(args.errorMessage)}
      onimageopened={() => props.onimageopened?.()}
      source={props.image}
      stretch="Fill"
    />
  {/if}
  <Path style:opacity={view.scrimOpacity} class="scrim" data={view.scrim} />
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
      {#each view.handles as handle (handle.name)}
        <Ellipse
          style:left="{handle.x - view.handleSize / 2}px"
          style:top="{handle.y - view.handleSize / 2}px"
          style:width="{view.handleSize}px"
          style:height="{view.handleSize}px"
          class="handle"
        />
      {/each}
    {/if}
    <Canvas class="layer stroke" class:drawing={view.isDrawing}>
      <Polyline class="stroke-glow" points={view.stroke} />
      <Polyline class="stroke-core" points={view.stroke} />
    </Canvas>
  </Canvas>
</Grid>

<style>
  :root {
    --selection-scrim-color: #000000;
    --selection-bracket-color: #ffffff;
    --selection-handle-color: #ffffff;
    --selection-stroke-core-color: #ffffff;
    --selection-edge-color: var(--system-accent-color-dark-1);
    --selection-glow-color: var(--system-accent-color-dark-1);
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --selection-edge-color: var(--system-accent-color-light-2);
      --selection-glow-color: var(--system-accent-color-light-2);
    }
  }

  .overlay {
    background-color: transparent;
  }

  .scrim {
    fill: var(--selection-scrim-color);
    transition: opacity 200ms;
  }

  .handle {
    position: absolute;
    fill: var(--selection-handle-color);
    stroke: var(--selection-edge-color);
    stroke-width: 2px;
  }

  .layer {
    width: 100%;
    height: 100%;
  }

  .selection {
    position: absolute;
    border-color: var(--selection-edge-color);
    border-width: 2px;
    border-radius: 24px;
    animation: selection-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .bracket {
    fill: none;
    stroke: var(--selection-bracket-color);
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
    stroke: var(--selection-glow-color);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 20px;
    opacity: 0.85;
    filter: blur(12px);
  }

  .stroke-core {
    stroke: var(--selection-stroke-core-color);
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
