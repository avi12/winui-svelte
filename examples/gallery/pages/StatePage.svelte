<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import type { Tally, TallyAction } from "#examples/gallery/tally-host.ts";
  import { startTallyHost, TALLY_NAME } from "#examples/gallery/tally-host.ts";
  import { keyControl } from "#examples/harness/smoke.ts";
  import { untrack } from "svelte";
  import { Button, StackPanel, TextBlock } from "winui-svelte/components";
  import { createHostChannel, hostState } from "winui-svelte/state";

  let count = $state(0);
  function doubled() {
    return count * 2;
  }
  const seen = $state<number[]>([]);

  $effect(() => {
    const current = count;
    untrack(() => seen.push(current));
  });

  const channel = createHostChannel<TallyAction>({ transport: startTallyHost() });
  const tally = hostState<Tally>({
    channel,
    name: TALLY_NAME
  });
  let outcome = $state("no action yet");

  async function send(action: TallyAction) {
    try {
      await channel.send(action);
      outcome = `${action.kind}: ok`;
    } catch (error) {
      outcome = `${action.kind}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  $effect(() => () => channel.dispose());
</script>

<PageFrame
  caption="Window state is Svelte's own runes. State the host owns arrives as a snapshot, then patches, and actions come back as promises."
  title="State management"
>
  <StackPanel class="state-block">
    <TextBlock text="$state, $derived and $effect" />
    <Button {@attach keyControl("state")} onclick={() => count++}>Count {count}</Button>
    <TextBlock text="doubled {doubled()}; an $effect saw {seen.join(", ")}" />
  </StackPanel>
  <StackPanel class="state-block">
    <TextBlock text="Host state: {tally.current?.clicks ?? "waiting"} clicks" />
    <TextBlock text="log: {tally.current?.log.join(", ") ?? ""}" />
    <Button onclick={() => send({ kind: "click" })}>Host click</Button>
    <Button onclick={() => send({ kind: "refuse" })}>Ask the host to refuse</Button>
    <Button onclick={() => send({ kind: "reset" })}>Reset</Button>
    <TextBlock text="outcome: {outcome}" />
  </StackPanel>
</PageFrame>

<style>
  :global(.state-block) {
    gap: 8px;
  }
</style>
