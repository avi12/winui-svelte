<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    children: Snippet;
  }

  const { children }: Props = $props();
</script>

<stack-panel class="page">
  {@render children()}
</stack-panel>

<style>
  .page {
    gap: 12px;
    max-width: 420px;
    padding: 24px;
  }
</style>
