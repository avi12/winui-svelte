<script lang="ts">
  import { TextBlock } from "winui-svelte/components";
  import type { HostChannel } from "winui-svelte/state";
  import { hostState } from "winui-svelte/state";

  interface Props {
    channel: HostChannel<never>;
  }

  const { channel }: Props = $props();
  // svelte-ignore state_referenced_locally
  const view = hostState<{ count: number }>({
    channel,
    name: "view"
  });

  $effect(() => {
    const count = view.current?.count;
    const isKnown = count !== undefined;
    if (isKnown) {
      process.stderr.write(`view count ${count}\n`);
    }
  });
</script>

<TextBlock>count: {view.current?.count ?? "waiting"}</TextBlock>
