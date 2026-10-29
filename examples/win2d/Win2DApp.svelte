<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { Window } from "winui-svelte/components";
  import {
    bitmapFromColors,
    Canvas,
    CanvasLinearGradientBrush,
    createTextFormat,
    GaussianBlurEffect
  } from "winui-svelte/win2d";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 360;
  const WINDOW_WIDTH = 480;
  const TILE_SIZE = 8;
  const TILE_SCALE = 8;
  const INITIAL_BLUR = 4;
  const SUN_HEIGHT_DIVISOR = 3;
  const MARGIN = 16;

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();
  let blurAmount = $state(INITIAL_BLUR);
  const status = {
    redraws: 0,
    runs: 0
  };
  const label = createTextFormat({ size: 20 });
  const checker = Array.from({ length: TILE_SIZE * TILE_SIZE }, (_color, i) => {
    const isLight = (i + Math.floor(i / TILE_SIZE)) % 2 === 0;
    return isLight ? {
      a: 255,
      r: 255,
      g: 200,
      b: 0
    } : {
      a: 255,
      r: 20,
      g: 40,
      b: 120
    };
  });

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => host.report({
      kind: "stats",
      blurAmount,
      ...status
    })],
    ["blur", command => {
      blurAmount = Number(command["amount"]);
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
  title="Win2D example"
  width={WINDOW_WIDTH}
>
  <Canvas
    draw={({ painter, width, height, device }) => {
      status.runs++;
      const sky = new CanvasLinearGradientBrush(device, {
        a: 255,
        r: 10,
        g: 20,
        b: 60
      }, {
        a: 255,
        r: 120,
        g: 40,
        b: 160
      });
      painter.fillRectangle({
        x: 0,
        y: 0,
        width,
        height,
        paint: sky
      });
      painter.fillCircle({
        x: width / 2,
        y: height / SUN_HEIGHT_DIVISOR,
        radius: 48,
        paint: {
          a: 255,
          r: 255,
          g: 220,
          b: 120
        }
      });
      painter.drawText({
        text: `Win2D from Svelte, blur ${blurAmount}`,
        x: 16,
        y: 16,
        paint: {
          a: 255,
          r: 255,
          g: 255,
          b: 255
        },
        format: label
      });
      const blur = new GaussianBlurEffect();
      blur.source = bitmapFromColors({
        creator: device,
        colors: checker,
        width: TILE_SIZE,
        height: TILE_SIZE
      });
      blur.blurAmount = blurAmount;
      painter.transformed({
        matrix: {
          m11: TILE_SCALE,
          m12: 0,
          m21: 0,
          m22: TILE_SCALE,
          m31: MARGIN,
          m32: height - TILE_SIZE * TILE_SCALE - MARGIN
        },
        draw: scaled => scaled.drawImage({ image: blur })
      });
    }}
    onDrawn={count => {
      status.redraws = count;
    }}
  />
</Window>
