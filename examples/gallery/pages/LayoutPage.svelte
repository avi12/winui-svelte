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
  import { SplitViewDisplayMode } from "winui-svelte/enums";

  const TILES = Array.from({ length: 12 }, (_unused, i) => ({
    id: String(i),
    label: `Tile ${i + 1}`
  }));
  const TILE = {
    width: 90,
    height: 40
  };
  const PANE_LENGTH = 140;
  const ROW_SPACING = 4;
  const anchor = elementRef<FrameworkElement>();
  let isPaneOpen = $state(true);
</script>

<PageFrame
  caption="Panels place their children. The grid is written in CSS; the canvas and the relative panel take attached properties as plain props."
  title="Layout"
>
  <StackPanel class="layout-demo">
    <TextBlock {@attach keyControl("layout")}>StackPanel</TextBlock>
    <TextBlock>spaced by the CSS gap</TextBlock>
  </StackPanel>
  <Grid class="layout-grid">
    <Border class="layout-cell wide"><TextBlock>spans two columns</TextBlock></Border>
    <Border class="layout-cell third"><TextBlock>star</TextBlock></Border>
    <Border class="layout-cell lower"><TextBlock>row 2</TextBlock></Border>
  </Grid>
  <Canvas class="layout-canvas">
    <Border class="layout-cell first">
      <TextBlock>left 20, top 10</TextBlock>
    </Border>
    <Border class="layout-cell second">
      <TextBlock>on top</TextBlock>
    </Border>
  </Canvas>
  <RelativePanel class="layout-relative">
    <Border class="layout-cell" {@attach anchor.attach} relativePanelAlignLeftWithPanel>
      <TextBlock>anchor</TextBlock>
    </Border>
    {#if anchor.current !== undefined}
      <Border class="layout-cell" relativePanelRightOf={anchor.current}>
        <TextBlock>right of the anchor</TextBlock>
      </Border>
    {/if}
  </RelativePanel>
  <SplitView
    class="layout-split"
    displayMode={SplitViewDisplayMode.Inline}
    openPaneLength={PANE_LENGTH}
    bind:isPaneOpen
  >
    {#snippet pane()}
      <TextBlock>the pane</TextBlock>
    {/snippet}
    <TextBlock>the content, beside the pane</TextBlock>
  </SplitView>
  <ScrollViewer class="layout-scroll scrolls">
    <ItemsRepeater items={TILES} key={tile => tile.id}>
      {#snippet layout()}
        <UniformGridLayout minItemHeight={TILE.height} minItemWidth={TILE.width} />
      {/snippet}
      {#snippet item(tile)}
        <Border class="layout-cell"><TextBlock>{tile.label}</TextBlock></Border>
      {/snippet}
    </ItemsRepeater>
  </ScrollViewer>
  <ScrollViewer class="layout-scroll">
    <ItemsRepeater items={TILES} key={tile => tile.id}>
      {#snippet layout()}
        <StackLayout spacing={ROW_SPACING} />
      {/snippet}
      {#snippet item(tile)}
        <TextBlock>{tile.label}</TextBlock>
      {/snippet}
    </ItemsRepeater>
  </ScrollViewer>
</PageFrame>

<style>
  .layout-demo {
    display: flex;
    gap: 16px;
  }

  .layout-grid {
    grid-template-rows: 40px 40px;
    grid-template-columns: 120px 120px 1fr;
    gap: 6px;
  }

  .layout-cell {
    padding: 8px;
    background-color: #0a84a8;
  }

  .wide {
    grid-column: 1 / span 2;
  }

  .third {
    grid-column: 3;
  }

  .lower {
    grid-row: 2;
  }

  .first {
    position: absolute;
    top: 10px;
    left: 20px;
  }

  .second {
    position: absolute;
    top: 40px;
    left: 140px;
    z-index: 1;
  }

  .scrolls {
    overflow: auto;
  }

  .layout-canvas {
    height: 90px;
  }

  .layout-relative {
    height: 50px;
  }

  .layout-split {
    height: 80px;
  }

  .layout-scroll {
    height: 120px;
  }
</style>
