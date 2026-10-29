<script lang="ts">
  import type { Snippet } from "svelte";
  import { StackPanel } from "winui-svelte/components";

  interface Props {
    header: Snippet<[string]>;
    children: Snippet;
  }

  const { header, children }: Props = $props();
</script>

<StackPanel>
  {@render header("card")}
  {@render children()}
</StackPanel>
