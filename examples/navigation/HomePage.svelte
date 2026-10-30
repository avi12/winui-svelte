<script lang="ts">
  import { pageStats } from "./page-stats.ts";
  import { StackPanel, TextBlock } from "winui-svelte/components";

  pageStats.home.created++;
  $effect(() => () => {
    pageStats.home.destroyed++;
  });
</script>

<StackPanel class="page">
  <TextBlock>Home</TextBlock>
  <TextBlock>Not cached: this page ends when you leave it.</TextBlock>
</StackPanel>

<style>
  .page {
    padding: 24px;
  }
</style>
