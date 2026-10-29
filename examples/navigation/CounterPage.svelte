<script lang="ts">
  import { pageStats } from "./page-stats.ts";
  import { Button, StackPanel, TextBlock } from "winui-svelte/components";

  interface Props {
    title: string;
  }

  const PADDING = 24;

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

<StackPanel padding={PADDING}>
  <TextBlock text={props.title} />
  <TextBlock text="Required: the count survives leaving and coming back." />
  <Button onClick={() => count++}>Clicked {count} times</Button>
</StackPanel>
