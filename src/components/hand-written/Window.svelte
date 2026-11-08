<script lang="ts">
  import type { WindowComponentProps } from "./window-props.ts";
  import type { FrameworkElement } from "#src/components/generated/bindings.js";
  import { ColumnDefinition, Grid, RowDefinition } from "#src/components/generated/bindings.js";
  import { control, registerControls } from "#src/components/runtime.js";
  import { provideWindowHandle } from "#src/components/window-context.js";
  import { attachWindow } from "#src/window/window-host.svelte.js";
  import { untrack } from "svelte";

  // A native window around its content. Mount it as the app's root (the
  // component itself is the window, nothing is placed in a page).
  let { handle = $bindable(), titleBar, children, ...rest }: WindowComponentProps = $props();
  provideWindowHandle(() => handle);
  registerControls({
    "column-definition": ColumnDefinition,
    grid: Grid,
    "row-definition": RowDefinition
  });
  let titleBarControl = $state.raw<FrameworkElement | null>(null);
  const layout = $derived.by(() => {
    const hasTitleBar = titleBar !== undefined;
    return {
      rows: hasTitleBar ? "Auto,*" : "*",
      contentRow: hasTitleBar ? 1 : 0
    };
  });

  function open(content: Grid) {
    const attached = attachWindow({
      content,
      props: rest,
      titleBar: () => titleBarControl
    });
    handle = attached.handle;
    return attached.dispose;
  }

  function holdTitleBar(bar: Grid) {
    titleBarControl = bar;
    return () => {
      titleBarControl = null;
    };
  }
</script>

<grid {@attach control((content: Grid) => untrack(() => open(content)))} rows={layout.rows}>
  {#if titleBar !== undefined}
    <grid {@attach control((bar: Grid) => untrack(() => holdTitleBar(bar)))} grid.row={0}>
      {@render titleBar()}
    </grid>
  {/if}
  <grid grid.row={layout.contentRow}>
    {@render children?.()}
  </grid>
</grid>
