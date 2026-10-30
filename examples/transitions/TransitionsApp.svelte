<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import type { StackPanel as StackPanelControl } from "#winui/microsoft/ui/xaml/controls/StackPanel";
  import type { TextBlock as TextBlockControl } from "#winui/microsoft/ui/xaml/controls/TextBlock";
  import { fly } from "svelte/transition";
  import { control } from "winui-svelte";
  import { StackPanel, TextBlock, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 320;
  const WINDOW_WIDTH = 420;
  const TRANSITION_MILLISECONDS = 600;
  const FLY_DISTANCE = 40;
  const PADDING = 16;
  const SPACING = 8;

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();
  const flyParams = {
    y: FLY_DISTANCE,
    duration: TRANSITION_MILLISECONDS
  };

  let isShown = $state(false);
  let panel: StackPanelControl | undefined;
  let card: TextBlockControl | undefined;

  function report(kind: string) {
    host.report({
      kind,
      // The card stays in the panel while it leaves.
      children: panel?.children.size ?? 0,
      opacity: card?.opacity ?? 1,
      translationY: card?.translation.y ?? 0
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => report("stats")],
    ["show", () => {
      isShown = true;
      report("shown");
    }],
    ["hide", () => {
      isShown = false;
      report("hidden");
    }],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  activate={false}
  height={WINDOW_HEIGHT}
  onClosed={exitApplication}
  placement={{
    x: -8000,
    y: 0
  }}
  title="Transitions example"
  width={WINDOW_WIDTH}
>
  <StackPanel
    {@attach control<StackPanelControl>(native => {
      panel = native;
    })}
    padding={PADDING}
    spacing={SPACING}
  >
    <TextBlock text="A card flies in and out" />
    {#if isShown}
      <text-block
        {@attach control<TextBlockControl>(native => {
          card = native;
        })}
        text="Hello"
        transition:fly={flyParams}
      ></text-block>
    {/if}
  </StackPanel>
</Window>
