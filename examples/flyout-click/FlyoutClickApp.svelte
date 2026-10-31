<script lang="ts">
  import type { ExampleHost } from "#examples/harness/contract.ts";
  import {
    Button,
    Flyout,
    StackPanel,
    TextBlock,
    Window
  } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();

  const WINDOW_HEIGHT = 320;
  const WINDOW_WIDTH = 420;

  // svelte-ignore state_referenced_locally
  const { options } = host;
  const IS_ALWAYS_ON_TOP = options["view"] === "top";
  const IS_ACTIVATABLE = options["view"] === "inactive" ? false : undefined;

  let isClickedOpen = $state(false);
  let isNativeOpen = $state(false);
  // How many times each flyout opened and closed, as WinUI reports it.
  const opened = $state<Record<string, number>>({});
  const closed = $state<Record<string, number>>({});

  function tally(name: string) {
    return {
      onopened() {
        opened[name] = (opened[name] ?? 0) + 1;
      },
      onclosed() {
        closed[name] = (closed[name] ?? 0) + 1;
      }
    };
  }

  function shown(name: string) {
    return (opened[name] ?? 0) - (closed[name] ?? 0);
  }

  // svelte-ignore state_referenced_locally
  host.onCommand(command => {
    const isClose = command["cmd"] === "close";
    if (isClose) {
      exitApplication();
      return;
    }

    host.report({
      kind: "stats",
      clickedOpen: isClickedOpen,
      nativeOpen: isNativeOpen,
      clickedShown: shown("clicked"),
      nativeShown: shown("native"),
      opened: JSON.stringify(opened),
      closed: JSON.stringify(closed)
    });
  });
</script>

<Window
  height={WINDOW_HEIGHT}
  isActivatable={IS_ACTIVATABLE}
  isAlwaysOnTop={IS_ALWAYS_ON_TOP}
  onclosed={exitApplication}
  title="Flyout click example"
  width={WINDOW_WIDTH}
>
  <StackPanel>
    <TextBlock>A flyout opened by its button's click</TextBlock>
    <Button
      automationId="clicked"
      onclick={() => {
        isClickedOpen = true;
      }}
    >
      Opens from onclick
      {#snippet flyout()}
        <Flyout bind:open={isClickedOpen} {...tally("clicked")}>
          <TextBlock>Opened from the click</TextBlock>
        </Flyout>
      {/snippet}
    </Button>
    <Button automationId="native">
      Opens on its own
      {#snippet flyout()}
        <Flyout bind:open={isNativeOpen} {...tally("native")}>
          <TextBlock>Opened by the button</TextBlock>
        </Flyout>
      {/snippet}
    </Button>
  </StackPanel>
</Window>
