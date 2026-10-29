<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import {
    Button,
    Canvas,
    Polygon,
    ProgressBar,
    StackPanel,
    TextBlock,
    ToggleSwitch
  } from "winui-svelte/components";

  const PROGRESS_STEP = 10;
  const MAXIMUM_PROGRESS = 100;
  let progress = $state(30);
</script>

<PageFrame
  caption="Props that WinUI types as a struct take what you would write: a number or text for a duration, a Date, an array for a point, text for a list of points."
  title="Data"
>
  <StackPanel class="data-block">
    <ProgressBar {@attach keyControl("data")} value={progress} />
    <Button onClick={() => (progress = (progress + PROGRESS_STEP) % (MAXIMUM_PROGRESS + PROGRESS_STEP))}>
      Step ({progress}%)
    </Button>
    <ToggleSwitch header="Toggle (0.3s transition, set as text)" />
    <Canvas class="data-canvas">
      <Polygon canvasLeft={20} fill="#00e5ff" points="0,40 40,0 80,40 40,80" />
    </Canvas>
    <TextBlock text="Points: '0,40 40,0 80,40 40,80'. Dates: {new Date(0).toISOString()}" />
  </StackPanel>
</PageFrame>

<style>
  :global(.data-block) {
    gap: 8px;
  }

  :global(.data-canvas) {
    height: 90px;
  }
</style>
