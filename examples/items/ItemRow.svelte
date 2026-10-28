<script lang="ts">
  import type { ExampleItem } from "#examples/lists/example-item.ts";
  import { rowStats } from "#examples/lists/row-stats.ts";

  interface Props {
    row: ExampleItem;
  }

  const { row }: Props = $props();

  rowStats.created++;
  $effect(() => () => {
    rowStats.destroyed++;
  });
</script>

<text-block>{row.name}</text-block>
