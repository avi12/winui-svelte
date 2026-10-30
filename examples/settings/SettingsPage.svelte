<script lang="ts">
  import type { Snippet } from "svelte";
  import { StackPanel } from "winui-svelte/components";

  interface Props {
    children: Snippet;
  }

  const { children }: Props = $props();
</script>

<StackPanel class="page">
  {@render children()}
</StackPanel>

<style>
  .page {
    gap: 12px;
    max-width: 420px;
    padding: 24px;
  }
</style>
