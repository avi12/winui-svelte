<script lang="ts">
  import { keep, note } from "./probe.ts";
  import { getContext, onDestroy, onMount } from "svelte";
  import { TextBlock } from "winui-svelte/components";

  const THEME = getContext<string>("theme");

  note("lifecycle:created");
  onMount(() => {
    note("lifecycle:mounted");
    return () => note("lifecycle:mount-cleanup");
  });
  onDestroy(() => note("lifecycle:destroyed"));
  $effect(() => () => note("lifecycle:effect-cleanup"));
</script>

<TextBlock {@attach keep("lifecycle")} automationId="lifecycle">context {THEME}</TextBlock>
