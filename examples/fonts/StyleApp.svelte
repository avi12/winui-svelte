<script lang="ts">
  import type { ExampleHost } from "#examples/harness/contract.ts";
  import type { TextBlock as NativeTextBlock } from "#winui/microsoft/ui/xaml/controls/TextBlock";
  import { elementRef } from "winui-svelte";
  import { StackPanel, TextBlock, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 200;
  const WINDOW_WIDTH = 480;
  const { host }: { host: ExampleHost } = $props();
  const custom = elementRef<NativeTextBlock>();
  const fallback = elementRef<NativeTextBlock>();

  // svelte-ignore state_referenced_locally
  host.onCommand(command => {
    const isStats = command["cmd"] === "stats";
    if (isStats) {
      host.report({
        kind: "stats",
        custom: custom.current?.actualWidth ?? 0,
        fallback: fallback.current?.actualWidth ?? 0
      });
    }

    const isClose = command["cmd"] === "close";
    if (isClose) {
      exitApplication();
    }
  });
</script>

<Window
  activate={false}
  height={WINDOW_HEIGHT}
  onclosed={exitApplication}
  placement={{
    x: -8000,
    y: 0
  }}
  title="Fonts example"
  width={WINDOW_WIDTH}
>
  <StackPanel>
    <TextBlock class="sized custom" {@attach custom.attach}>Hello Face</TextBlock>
    <TextBlock class="sized" {@attach fallback.attach}>Hello Face</TextBlock>
  </StackPanel>
</Window>

<style>
  @font-face {
    font-family: "Winui Test Face";
    src: url("../../test/fixtures/winui-test-face.ttf") format("truetype");
  }

  .sized {
    font-size: 20px;
  }

  .custom {
    font-family: "Winui Test Face", "Segoe UI";
  }
</style>
