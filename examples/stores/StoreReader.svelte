<script lang="ts">
  import type { Readable } from "svelte/store";
  import { TextBlock } from "winui-svelte/components";

  interface Props {
    store: Readable<number>;
    automationId: string;
  }

  const { store, ...rest }: Props = $props();
</script>

<TextBlock {...rest}>{$store}</TextBlock>
