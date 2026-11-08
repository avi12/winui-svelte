<script lang="ts">
  import type { ExampleHost } from "#examples/harness/contract.ts";
  import {
    Button,
    ProgressBar,
    StackPanel,
    TextBlock,
    Window
  } from "winui-svelte/components";
  import { TaskbarProgress, trackOperation } from "winui-svelte/progress";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_WIDTH = 420;
  const WINDOW_HEIGHT = 280;
  const TICK_MILLISECONDS = 150;
  const TOTAL = 100;
  const STEP = 4;

  const { host }: { host: ExampleHost } = $props();

  // The work: no registry to create or pass; the operation lists itself
  let copy = $state.raw(startCopy());

  function startCopy() {
    return trackOperation({
      label: "Copying",
      group: "sync",
      total: TOTAL,
      async run(operation) {
        for (let loaded = STEP; loaded <= TOTAL; loaded += STEP) {
          await new Promise(resolve => setTimeout(resolve, TICK_MILLISECONDS));
          operation.signal.throwIfAborted();
          operation.update({ loaded });
        }
      }
    });
  }

  // svelte-ignore state_referenced_locally
  host.onCommand(command => {
    const isClose = command["cmd"] === "close";
    if (isClose) {
      exitApplication();
    }
  });
</script>

<Window height={WINDOW_HEIGHT} onclosed={exitApplication} title="Progress example" width={WINDOW_WIDTH}>
  <TaskbarProgress />
  <StackPanel class="page">
    <TextBlock>{copy.label}: {Math.round(copy.value * TOTAL)}%</TextBlock>
    <ProgressBar
      isIndeterminate={copy.isIndeterminate}
      maximum={1}
      showError={copy.showError}
      showPaused={copy.showPaused}
      value={copy.value}
    />
    <StackPanel class="row">
      <Button onclick={() => (copy = startCopy())}>Start</Button>
      <Button onclick={() => copy.cancel()}>Cancel</Button>
    </StackPanel>
  </StackPanel>
</Window>

<style>
  .page {
    gap: 12px;
    padding: 24px;
  }

  .row {
    flex-direction: row;
    gap: 8px;
  }
</style>
