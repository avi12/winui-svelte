<script lang="ts">
  import type { Readable } from "svelte/store";
  import { TextBlock } from "winui-svelte/components";

  interface Props {
    store: Readable<number>;
  }

  const { store }: Props = $props();
  let seen = $state(0);

  $effect(() => store.subscribe(value => {
    seen = value;
  }));
</script>

<TextBlock automationId="subscriber">{$store} / {seen}</TextBlock>
