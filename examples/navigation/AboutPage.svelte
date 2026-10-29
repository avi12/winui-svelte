<script lang="ts">
  import { pageStats } from "./page-stats.ts";
  import { StackPanel, TextBlock } from "winui-svelte/components";

  interface Props {
    version: string;
  }

  const PADDING = 24;

  const props: Props = $props();

  pageStats.about.created++;
  $effect(() => () => {
    pageStats.about.destroyed++;
  });
</script>

<StackPanel padding={PADDING}>
  <TextBlock text="About" />
  <TextBlock text={`Version ${props.version}`} />
</StackPanel>
