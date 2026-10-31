<script lang="ts">
  import { CONTEXT_KEY } from "./stores.ts";
  import { getContext } from "svelte";
  import type { Writable } from "svelte/store";
  import { TextBlock } from "winui-svelte/components";

  const label = getContext<Writable<string>>(CONTEXT_KEY);
</script>

<TextBlock automationId="context">{$label}</TextBlock>
