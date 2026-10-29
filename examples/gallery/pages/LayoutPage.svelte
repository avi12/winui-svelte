<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import type { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";
  import { elementRef } from "winui-svelte";
  import {
    Border,
    Canvas,
    Grid,
    ItemsRepeater,
    RelativePanel,
    ScrollViewer,
    SplitView,
    StackLayout,
    StackPanel,
    TextBlock,
    UniformGridLayout
  } from "winui-svelte/components";

  const TILES = Array.from({ length: 12 }, (_unused, i) => ({
    id: String(i),
    label: `Tile ${i + 1}`
  }));
  const anchor = elementRef<FrameworkElement>();
  let isPaneOpen = $state(true);
</script>

<PageFrame
  caption="Panels place their children. The grid is written in CSS; the canvas and the relative panel take attached properties as plain props."
  title="Layout"
>
  <StackPanel class="layout-demo" orientation="Horizontal">
    <TextBlock {@attach keyControl("layout")} text="StackPanel" />
    <TextBlock text="spaced by the CSS gap" />
  </StackPanel>
  <Grid class="layout-grid">
    <Border class="layout-cell wide" gridColumn={0} gridColumnSpan={2}><TextBlock text="spans two columns" /></Border>
    <Border class="layout-cell" gridColumn={2}><TextBlock text="star" /></Border>
    <Border class="layout-cell" gridRow={1}><TextBlock text="row 2" /></Border>
  </Grid>
  <Canvas class="layout-canvas">
    <Border class="layout-cell" canvasLeft={20} canvasTop={10}><TextBlock text="left 20, top 10" /></Border>
    <Border class="layout-cell" canvasLeft={140} canvasTop={40} canvasZIndex={1}><TextBlock text="on top" /></Border>
  </Canvas>
  <RelativePanel class="layout-relative">
    <Border class="layout-cell" {@attach anchor.attach} relativePanelAlignLeftWithPanel><TextBlock text="anchor" /></Border>
    {#if anchor.current !== undefined}
      <Border class="layout-cell" relativePanelRightOf={anchor.current}><TextBlock text="right of the anchor" /></Border>
    {/if}
  </RelativePanel>
  <SplitView class="layout-split" displayMode="Inline" openPaneLength={140} bind:isPaneOpen>
    {#snippet pane()}
      <TextBlock text="the pane" />
    {/snippet}
    <TextBlock text="the content, beside the pane" />
  </SplitView>
  <ScrollViewer class="layout-scroll" horizontalScrollBarVisibility="Auto" verticalScrollBarVisibility="Auto">
    <ItemsRepeater items={TILES} key={tile => tile.id}>
      {#snippet layout()}
        <UniformGridLayout minItemHeight={40} minItemWidth={90} />
      {/snippet}
      {#snippet item(tile)}
        <Border class="layout-cell"><TextBlock text={tile.label} /></Border>
      {/snippet}
    </ItemsRepeater>
  </ScrollViewer>
  <ScrollViewer class="layout-scroll">
    <ItemsRepeater items={TILES} key={tile => tile.id}>
      {#snippet layout()}
        <StackLayout spacing={4} />
      {/snippet}
      {#snippet item(tile)}
        <TextBlock text={tile.label} />
      {/snippet}
    </ItemsRepeater>
  </ScrollViewer>
</PageFrame>

<style>
  :global(.layout-demo) {
    gap: 16px;
  }

  :global(.layout-grid) {
    grid-template-rows: 40px 40px;
    grid-template-columns: 120px 120px 1fr;
    gap: 6px;
  }

  :global(.layout-cell) {
    padding: 8px;
    background-color: #0a84a8;
  }

  :global(.layout-canvas) {
    height: 90px;
  }

  :global(.layout-relative) {
    height: 50px;
  }

  :global(.layout-split) {
    height: 80px;
  }

  :global(.layout-scroll) {
    height: 120px;
  }
</style>
