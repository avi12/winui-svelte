<script lang="ts">
  import type { ExampleHost } from "#examples/harness/contract.ts";
  import type { TextBlock as NativeTextBlock } from "#winui/microsoft/ui/xaml/controls/TextBlock";
  import { elementRef } from "winui-svelte";
  import { StackPanel, TextBlock, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const FONT_SIZE = 20;
  const WINDOW_HEIGHT = 200;
  const WINDOW_WIDTH = 480;
  const FONT_FAMILY = "Winui Test Face";
  const { host }: { host: ExampleHost } = $props();
  const custom = elementRef<NativeTextBlock>();
  const fallback = elementRef<NativeTextBlock>();
  document.fonts.add(new FontFace(FONT_FAMILY, `url("${host.options["file"] ?? ""}")`));

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
    <TextBlock {@attach custom.attach} fontFamily="{FONT_FAMILY}, Segoe UI" fontSize={FONT_SIZE}>Hello Face</TextBlock>
    <TextBlock {@attach fallback.attach} fontSize={FONT_SIZE}>Hello Face</TextBlock>
  </StackPanel>
</Window>
