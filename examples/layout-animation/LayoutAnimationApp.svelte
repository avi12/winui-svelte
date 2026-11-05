<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import type { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";
  import { elementRef } from "winui-svelte";
  import { Border, StackPanel, Window } from "winui-svelte/components";
  import { implicitLayoutAnimation, LayoutEasing } from "winui-svelte/implicit-layout-animation";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 600;
  const WINDOW_WIDTH = 300;
  const SLIDE_MILLISECONDS = 5000;
  const SHORT_SPACER = 40;
  const TALL_SPACER = 160;
  const PROBE_DROP = 60;

  interface Props {
    host: ExampleHost;
  }

  const { host }: Props = $props();
  const stage = elementRef<FrameworkElement>();
  let spacer = $state(SHORT_SPACER);
  let drop = $state(0);

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => host.report({
      kind: "stats",
      scale: stage.current?.xamlRoot?.rasterizationScale ?? 1
    })],
    ["grow", () => {
      spacer = TALL_SPACER;
      host.report({ kind: "grown" });
    }],
    ["shrink", () => {
      spacer = SHORT_SPACER;
      host.report({ kind: "shrunk" });
    }],
    ["drop", () => {
      drop = PROBE_DROP;
      host.report({ kind: "dropped" });
    }],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window height={WINDOW_HEIGHT} onclosed={exitApplication} title="Layout animation example" width={WINDOW_WIDTH}>
  <StackPanel
    class="stage"
    {@attach stage.attach}
    {@attach implicitLayoutAnimation({
      duration: SLIDE_MILLISECONDS,
      easing: LayoutEasing.LINEAR
    })}
  >
    <Border style:height="{spacer}px" />
    <Border class="marker" />
    <Border style:translate="0px {drop}px" class="probe" />
  </StackPanel>
</Window>

<style>
  .stage {
    background-color: #ff0000;
  }

  .marker {
    height: 60px;
    background-color: #0000ff;
  }

  .probe {
    justify-self: end;
    width: 40px;
    height: 40px;
    background-color: #00ff00;
  }
</style>
