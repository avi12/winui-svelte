<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { Border, Grid, Window } from "winui-svelte/components";
  import { bitmapFromColors, Canvas, GaussianBlurEffect } from "winui-svelte/win2d";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 240;
  const WINDOW_WIDTH = 320;
  const TILE_SIZE = 4;
  const TILE_SCALE = 16;
  const BLUR_AMOUNT = 3;
  const FULL = 255;
  const DARK = {
    r: 20,
    g: 40,
    b: 120
  };
  const LIGHT = {
    r: FULL,
    g: 200,
    b: 0
  };

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();
  const status = {
    redraws: 0,
    runs: 0
  };
  const colors = Array.from({ length: TILE_SIZE * TILE_SIZE }, (_color, i) => {
    const isLight = (i + Math.floor(i / TILE_SIZE)) % 2 === 0;
    return {
      a: FULL,
      ...(isLight ? LIGHT : DARK)
    };
  });
  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => host.report({
      kind: "stats",
      ...status
    })],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  height={WINDOW_HEIGHT}
  onclosed={exitApplication}
  title="Packaged Win2D example"
  width={WINDOW_WIDTH}
>
  <Grid class="stage">
    <Border class="glow" />
    <Canvas
      draw={({ painter, device }) => {
        status.runs++;
        const blur = new GaussianBlurEffect();
        blur.source = bitmapFromColors({
          creator: device,
          colors,
          width: TILE_SIZE,
          height: TILE_SIZE
        });
        blur.blurAmount = BLUR_AMOUNT;
        painter.transformed({
          matrix: {
            m11: TILE_SCALE,
            m12: 0,
            m21: 0,
            m22: TILE_SCALE,
            m31: 0,
            m32: 0
          },
          draw: scaled => scaled.drawImage({ image: blur })
        });
      }}
      height={WINDOW_HEIGHT}
      ondrawn={count => {
        status.redraws = count;
      }}
      width={WINDOW_WIDTH}
    />
  </Grid>
</Window>

<style>
  .stage {
    width: 320px;
    height: 200px;
  }

  .glow {
    align-self: center;
    justify-self: center;
    width: 120px;
    height: 80px;
    background-color: #00e5ff;
    filter: blur(12px);
  }
</style>
