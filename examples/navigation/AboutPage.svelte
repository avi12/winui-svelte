<script lang="ts">
  import { pageStats } from "./page-stats.ts";

  interface Props {
    version: string;
  }

  const props: Props = $props();

  pageStats.about.created++;
  $effect(() => () => {
    pageStats.about.destroyed++;
  });
</script>

<stack-panel class="page">
  <text-block>About</text-block>
  <text-block>Version {props.version}</text-block>
</stack-panel>

<style>
  .page {
    padding: 24px;
  }
</style>
