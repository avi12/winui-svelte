<script lang="ts">
  import type { ExampleHost } from "#examples/harness/contract.ts";
  import { flush } from "winui-svelte";
  import { Window } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";

  const { host }: { host: ExampleHost } = $props();

  let generation = $state(0);
  let handle: WindowHandle | undefined = $state();

  // svelte-ignore state_referenced_locally
  host.onCommand(command => {
    const name = String(command["cmd"]);
    const isSwap = name === "swap";
    const isClose = name === "close";
    if (isSwap) {
      generation += 1;
      flush();
    }

    if (isClose) {
      handle?.close();
    }

    host.report({
      kind: isSwap ? "swapped" : "info",
      generation,
      isVisible: handle?.appWindow.isVisible ?? false
    });
  });
</script>

{#key generation}
  <Window activate={false} title="Swap {generation}" bind:handle>
    <grid />
  </Window>
{/key}
