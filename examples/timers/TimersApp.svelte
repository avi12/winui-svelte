<script lang="ts">
  import type { ExampleHost } from "#examples/harness/contract.ts";
  import type { TextBlock as NativeTextBlock } from "#winui/microsoft/ui/xaml/controls/TextBlock";
  import { elementRef } from "winui-svelte";
  import { StackPanel, TextBlock, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 200;
  const WINDOW_WIDTH = 360;
  const TICK_MILLISECONDS = 50;

  const { host }: { host: ExampleHost } = $props();
  const clock = elementRef<NativeTextBlock>();
  const message = elementRef<NativeTextBlock>();
  let ticks = $state(0);
  let messageText = $state("");

  $effect(() => {
    const interval = setInterval(() => {
      ticks += 1;
    }, TICK_MILLISECONDS);
    return () => clearInterval(interval);
  });

  async function waitThenShow(milliseconds: number) {
    const startedAt = performance.now();
    await new Promise(resolve => setTimeout(resolve, milliseconds));
    messageText = "waited";
    host.report({
      kind: "waited",
      elapsed: performance.now() - startedAt
    });
  }

  async function fetchThenShow(url: string) {
    const response = await fetch(url);
    messageText = await response.text();
    host.report({
      kind: "fetched",
      status: response.status,
      body: messageText
    });
  }

  const commands = new Map<string, (command: Record<string, unknown>) => unknown>([
    ["stats", () => host.report({
      kind: "stats",
      ticks,
      clockText: clock.current?.text ?? "",
      messageText: message.current?.text ?? ""
    })],
    ["wait", command => waitThenShow(Number(command["milliseconds"]))],
    ["fetch", command => fetchThenShow(String(command["url"]))],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  activate={false}
  height={WINDOW_HEIGHT}
  onclosed={exitApplication}
  placement={{
    x: -8000,
    y: 0
  }}
  title="Timers example"
  width={WINDOW_WIDTH}
>
  <StackPanel>
    <TextBlock {@attach clock.attach}>{ticks}</TextBlock>
    <TextBlock {@attach message.attach}>{messageText}</TextBlock>
  </StackPanel>
</Window>
