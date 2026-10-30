<script lang="ts">
  import type { ExampleItem } from "./example-item.ts";
  import { rowStats } from "./row-stats.ts";

  interface Props {
    row: ExampleItem;
  }

  const { row }: Props = $props();

  rowStats.created++;
  $effect(() => () => {
    rowStats.destroyed++;
  });
</script>

<stack-panel class="row">
  <text-block>{row.name}</text-block>
  <text-block class="id">#{row.id}</text-block>
</stack-panel>

<style>
  .row {
    flex-direction: row;
    gap: 12px;
    padding: 8px 12px;
  }

  .id {
    opacity: 0.6;
  }
</style>
