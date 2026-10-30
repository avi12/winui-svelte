<script lang="ts">
  import { pageStats } from "./page-stats.ts";
  import { StackPanel, TextBlock } from "winui-svelte/components";

  interface Props {
    version: string;
  }

  const props: Props = $props();

  pageStats.about.created++;
  $effect(() => () => {
    pageStats.about.destroyed++;
  });
</script>

<StackPanel class="page">
  <TextBlock>About</TextBlock>
  <TextBlock>Version {props.version}</TextBlock>
</StackPanel>

<style>
  .page {
    padding: 24px;
  }
</style>
