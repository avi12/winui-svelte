<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import { Slider } from "winui-svelte/components";
  import { Canvas, CanvasLinearGradientBrush, createTextFormat } from "winui-svelte/win2d";

  const SUN_RADIUS = 36;
  const MARGIN = 16;
  const MAX_SUN = 100;
  const INITIAL_SUN = 50;
  // A prop, not CSS: a Style cannot target CanvasControl, XamlReader cannot create the type
  const CANVAS_HEIGHT = 200;

  let sunAt = $state(INITIAL_SUN);
  const label = createTextFormat({ size: 18 });
</script>

<PageFrame
  caption="Win2D draws on a Canvas from a function. What the function reads is tracked, so moving the slider draws again."
  title="Win2D canvas"
>
  <Slider header="Sun position: {sunAt}" maximum={MAX_SUN} bind:value={sunAt} />
  <Canvas
    {@attach keyControl("win2d")}
    draw={({ painter, width, height, device }) => {
      painter.fillRectangle({
        x: 0,
        y: 0,
        width,
        height,
        paint: new CanvasLinearGradientBrush(device, {
          a: 255,
          r: 10,
          g: 20,
          b: 60
        }, {
          a: 255,
          r: 120,
          g: 40,
          b: 160
        })
      });
      painter.fillCircle({
        x: MARGIN + (width - 2 * MARGIN) * sunAt / MAX_SUN,
        y: height / 2,
        radius: SUN_RADIUS,
        paint: {
          a: 255,
          r: 255,
          g: 220,
          b: 120
        }
      });
      painter.drawText({
        text: "Win2D from Svelte",
        x: MARGIN,
        y: MARGIN,
        paint: {
          a: 255,
          r: 255,
          g: 255,
          b: 255
        },
        format: label
      });
    }}
    height={CANVAS_HEIGHT}
  />
</PageFrame>
