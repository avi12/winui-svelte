<script lang="ts">
  import { pageStats } from "./page-stats.ts";

  interface Props {
    title: string;
  }

  const props: Props = $props();
  let count = $state(0);

  pageStats.counter.created++;
  pageStats.bump = () => {
    count++;
  };
  $effect(() => {
    pageStats.counterValue = count;
  });
  $effect(() => () => {
    pageStats.counter.destroyed++;
  });
</script>

<stack-panel class="page">
  <text-block>{props.title}</text-block>
  <text-block>Required: the count survives leaving and coming back.</text-block>
  <button onclick={() => count++}>Clicked {count} times</button>
</stack-panel>

<style>
  .page {
    padding: 24px;
  }
</style>
