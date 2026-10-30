<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import {
    CalendarDatePicker,
    Canvas,
    Path,
    Polygon,
    StackPanel,
    TextBlock
  } from "winui-svelte/components";

  const DIAMOND = "20,40 60,0 100,40 60,80";
  const MILLENNIUM = "2000-01-01";
</script>

<PageFrame
  caption="A prop that WinUI types as a struct takes what you would write: text for a weight, text for points, path data for a geometry, an ISO string for a date."
  title="Data"
>
  <StackPanel class="data-block">
    <TextBlock {@attach keyControl("data")} fontWeight="bold">fontWeight is the text 'bold'</TextBlock>
    <Canvas class="data-canvas">
      <Polygon fill="#00e5ff" points={DIAMOND} />
      <Polygon class="data-triangle" fill="#c42b1c" points="0,40 40,0 80,40" />
      <Path class="data-path" data="M0,0 L60,0 L30,50 Z" fill="#6b2fa0" />
    </Canvas>
    <TextBlock>Points as text, and a Path's geometry as path data</TextBlock>
    <CalendarDatePicker date={MILLENNIUM} header="A date from an ISO string" />
  </StackPanel>
</PageFrame>

<style>
  .data-block {
    gap: 8px;
  }

  .data-canvas {
    height: 90px;
  }

  .data-triangle {
    position: absolute;
    left: 120px;
  }

  .data-path {
    position: absolute;
    left: 240px;
  }
</style>
