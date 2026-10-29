<script lang="ts">
  import { pageStats } from "./page-stats.ts";
  import { StackPanel, TextBlock } from "winui-svelte/components";

  const PADDING = 24;

  pageStats.home.created++;
  $effect(() => () => {
    pageStats.home.destroyed++;
  });
</script>

<StackPanel padding={PADDING}>
  <TextBlock text="Home" />
  <TextBlock text="Not cached: this page ends when you leave it." />
</StackPanel>
