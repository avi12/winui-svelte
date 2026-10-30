<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import type { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";
  import { elementRef } from "winui-svelte";
  import { Border, Grid, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 360;
  const WINDOW_WIDTH = 480;

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();
  const stage = elementRef<FrameworkElement>();
  let targetClass = $state("");

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => host.report({
      kind: "stats",
      scale: stage.current?.xamlRoot?.rasterizationScale ?? 1
    })],
    ["set", command => {
      targetClass = String(command["class"]);
      host.report({
        kind: "set",
        targetClass
      });
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
  title="Effects example"
  width={WINDOW_WIDTH}
>
  <Grid class="fx-stage" {@attach stage.attach}>
    <Border class="fx-left" />
    <Border class="fx-right" />
    <Border class={["fx-target", targetClass]}>
      <Grid>
        <Border class="fx-green" />
        <Border class="fx-black" />
      </Grid>
    </Border>
  </Grid>
</Window>

<style>
  :global(.fx-stage) {
    width: 480px;
    height: 330px;
  }

  :global(.fx-left) {
    justify-self: start;
    width: 240px;
    background-color: #ff0000;
  }

  :global(.fx-right) {
    justify-self: end;
    width: 240px;
    background-color: #0000ff;
  }

  :global(.fx-target) {
    align-self: center;
    justify-self: center;
    width: 160px;
    height: 100px;
    background-color: #ffff00;
  }

  :global(.fx-green) {
    justify-self: start;
    width: 40px;
    background-color: #00aa00;
  }

  :global(.fx-black) {
    justify-self: end;
    width: 40px;
    background-color: #000000;
  }

  :global(.fx-blur) {
    filter: blur(6px);
  }

  :global(.fx-gray) {
    filter: grayscale(1);
  }

  :global(.fx-shadow) {
    filter: drop-shadow(8px 8px 4px #000000);
  }

  :global(.fx-multiply) {
    mix-blend-mode: multiply;
  }

  :global(.fx-mask) {
    mask-image: linear-gradient(to right, #000000, transparent);
  }

  :global(.fx-backdrop) {
    background-color: rgb(255 255 0 / 30%);
    backdrop-filter: blur(8px);
  }

  :global(.fx-circle) {
    clip-path: circle(40px);
  }

  :global(.fx-polygon) {
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
  }

  :global(.fx-round) {
    clip-path: inset(10px round 30px);
  }

  :global(.fx-blur-circle) {
    clip-path: circle(45px);
    filter: blur(3px);
  }
</style>
