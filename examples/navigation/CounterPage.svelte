<script lang="ts">
  import { pageStats } from "./page-stats.ts";
  import { Button, StackPanel, TextBlock } from "winui-svelte/components";

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

<StackPanel class="page">
  <TextBlock>{props.title}</TextBlock>
  <TextBlock>Required: the count survives leaving and coming back.</TextBlock>
  <Button onclick={() => count++}>Clicked {count} times</Button>
</StackPanel>

<style>
  .page {
    padding: 24px;
  }
</style>
