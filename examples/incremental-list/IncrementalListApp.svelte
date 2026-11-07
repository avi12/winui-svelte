<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { projectAs } from "#winui/lifetime";
  import { Control } from "#winui/microsoft/ui/xaml/controls/Control";
  import type { ListViewBase } from "#winui/microsoft/ui/xaml/controls/ListViewBase";
  import { ScrollViewer } from "#winui/microsoft/ui/xaml/controls/ScrollViewer";
  import {
    Button,
    ListView,
    StackPanel,
    TextBlock,
    Window
  } from "winui-svelte/components";
  import { createIncrementalSource, IncrementalStatus } from "winui-svelte/incremental";
  import { exitApplication } from "winui-svelte/window";

  const TOTAL_ITEMS = 100;
  const BATCH_SIZE = 20;
  const LOAD_MILLISECONDS = 30;
  const WINDOW_HEIGHT = 480;
  const WINDOW_WIDTH = 360;
  const FOOTER_HEIGHT = 120;
  const SCROLL_PART = "ScrollViewer";

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  interface Row {
    id: string;
  }

  const { host }: Props = $props();

  let view: ListViewBase | undefined;
  let isFailing = false;
  let loads = 0;

  // Rows from a pretend server of TOTAL_ITEMS, slow enough to see the loading state. With `fail`, a load fails once.
  const source = createIncrementalSource<Row>({
    batchSize: BATCH_SIZE,
    async load({ offset, count, signal }) {
      loads++;
      await new Promise(resolve => setTimeout(resolve, LOAD_MILLISECONDS));
      signal.throwIfAborted();

      if (isFailing) {
        isFailing = false;
        throw new Error("the server is away");
      }

      const end = Math.min(offset + count, TOTAL_ITEMS);
      return Array.from({ length: end - offset }, (_unused, index) => ({ id: `row-${offset + index}` }));
    }
  });

  function report(kind: string) {
    const { state } = source;
    host.report({
      kind,
      loaded: source.items.length,
      status: state.status,
      error: state.status === IncrementalStatus.ERROR ? state.error.message : null,
      loads
    });
  }

  function scroller() {
    const current = view;
    const isMounted = current !== undefined;
    if (!isMounted) {
      return null;
    }

    const control = projectAs(current, Control);
    control.applyTemplate();
    const part = control.getTemplateChild(SCROLL_PART);
    return part === null ? null : projectAs(part, ScrollViewer);
  }

  // What a test or a script can ask of the window.
  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => report("stats")],
    ["scroll-end", () => {
      const scrollViewer = scroller();
      scrollViewer?.changeView(null, scrollViewer.scrollableHeight, null, true);
      report("scrolled");
    }],
    ["fail-next", () => {
      isFailing = true;
      report("armed");
    }],
    ["retry", () => {
      void source.retry();
      report("retried");
    }],
    ["reset", () => {
      source.reset();
      report("reset");
    }],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

{#snippet rowOf(row: Row)}
  <text-block>{row.id}</text-block>
{/snippet}

<Window
  height={WINDOW_HEIGHT}
  onclosed={exitApplication}
  title="Incremental list example"
  width={WINDOW_WIDTH}
>
  <StackPanel>
    <ListView
      height={WINDOW_HEIGHT - FOOTER_HEIGHT}
      incremental={source}
      item={rowOf}
      items={source.items}
      key={row => row.id}
      oncontrol={control => {
        view = control;
      }}
    />
    {#if source.state.status === IncrementalStatus.LOADING}
      <TextBlock text="Loading more..." />
    {:else if source.state.status === IncrementalStatus.ERROR}
      <Button content="Retry" onclick={() => source.retry()} />
    {:else if source.state.status === IncrementalStatus.DONE}
      <TextBlock text="That is all" />
    {/if}
  </StackPanel>
</Window>
