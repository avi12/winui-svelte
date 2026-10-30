<script lang="ts">
  import { pageStats } from "./page-stats.ts";

  pageStats.home.created++;
  $effect(() => () => {
    pageStats.home.destroyed++;
  });
</script>

<stack-panel class="page">
  <text-block>Home</text-block>
  <text-block>Not cached: this page ends when you leave it.</text-block>
</stack-panel>

<style>
  .page {
    padding: 24px;
  }
</style>
