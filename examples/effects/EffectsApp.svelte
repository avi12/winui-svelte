<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { projectAs } from "#winui/lifetime";
  import type { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";
  import { XamlReader } from "#winui/microsoft/ui/xaml/markup/XamlReader";
  import { PathGeometry } from "#winui/microsoft/ui/xaml/media/PathGeometry";
  import { Path } from "#winui/microsoft/ui/xaml/shapes/Path";
  import { blur, draw } from "svelte/transition";
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
  let isCardShown = $state(false);
  let isLineShown = $state(false);

  const BLUR_AMOUNT = 30;
  // A raw <path> takes a Geometry, which XAML's reader makes from the path data of a Path.
  const holder = projectAs(
    XamlReader.load("<Path xmlns=\"http://schemas.microsoft.com/winfx/2006/xaml/presentation\" Data=\"M10,10 L190,10 L190,70\"/>"),
    Path
  );
  const lineGeometry = projectAs(holder.data, PathGeometry);
  Object.assign(holder, { data: null });
  // Svelte types a <path> as SVG's, which has no `data`: the renderer sets it on the WinUI Path all the same.
  const lineAttributes = { data: lineGeometry };
  const TRANSITION_MILLISECONDS = 3000;
  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["card", command => {
      isCardShown = command["show"] === true;
      host.report({
        kind: "card",
        isCardShown
      });
    }],
    ["line", command => {
      isLineShown = command["show"] === true;
      host.report({
        kind: "line",
        isLineShown
      });
    }],
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
  onclosed={exitApplication}
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
    {#if isCardShown}
      <grid
        class="fx-card" transition:blur={{
          amount: BLUR_AMOUNT,
          opacity: 1,
          duration: TRANSITION_MILLISECONDS
        }}>
        <border class="fx-white"></border>
        <border class="fx-ink"></border>
      </grid>
    {/if}
    {#if isLineShown}
      <path class="fx-line" {...lineAttributes} in:draw={{ duration: TRANSITION_MILLISECONDS }}></path>
    {/if}
    <Border class="fx-target {targetClass}">
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

  :global(.fx-card) {
    align-self: start;
    justify-self: start;
    width: 100px;
    height: 60px;
    margin: 16px;
  }

  :global(.fx-white) {
    justify-self: start;
    width: 50px;
    background-color: #ffffff;
  }

  :global(.fx-ink) {
    justify-self: end;
    width: 50px;
    background-color: #000000;
  }

  :global(.fx-line) {
    align-self: end;
    justify-self: start;
    margin: 8px;
    stroke: #ffffff;
    stroke-width: 4px;
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
    background-color: rgb(255 255 0 / 0.3);
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
