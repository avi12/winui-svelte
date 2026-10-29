<script lang="ts">
  import type { TreeItem } from "./tree-item.ts";
  import { rowStats } from "#examples/lists/row-stats.ts";

  interface Props {
    item: TreeItem;
  }

  const { item }: Props = $props();

  rowStats.created++;
  $effect(() => () => {
    rowStats.destroyed++;
  });
</script>

<text-block>{item.name}</text-block>
